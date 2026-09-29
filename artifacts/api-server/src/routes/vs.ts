import { randomInt } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import {
  appointments,
  blockedSlots,
  clients,
  db,
  professionals,
  scheduleOverrides,
  services,
} from "@workspace/db";
import {
  CreateAppointmentBody,
  GetAvailabilityQueryParams,
  GetAppointmentParams,
  GetScheduleSettingsQueryParams,
  GetStaffAgendaQueryParams,
  RescheduleAppointmentBody,
  RescheduleAppointmentParams,
  UpdateAppointmentStatusBody,
  UpdateAppointmentStatusParams,
  UpdateScheduleBody,
  UpdateSlotBody,
} from "@workspace/api-zod";
import { currentUser } from "../lib/auth";
import { getSalonSettings } from "../lib/settings";

const router: IRouter = Router();
const SLOT_STEP_MINUTES = 30;
const BLOCK_MINUTES = 30;
const MAX_DAYS_AHEAD = 180;
const SALON_TIME_ZONE = "America/Sao_Paulo";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type Executor = Pick<typeof db, "select">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type StaffContext = {
  userId: number;
  email: string;
  name: string;
  role: "admin" | "professional";
  professionalId?: number;
};

type SlotResult = { time: string; available: boolean; reason: string | null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimal(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}:00`;
}

function normalizeTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${match[1]}:${match[2]}:00`;
}

function toIsoDate(value: string | Date): string {
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function dateWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Current date and minute of the day in the salon's time zone. */
function salonNow(): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SALON_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Returns an error message when the date cannot receive public bookings. */
function bookingDateError(date: string): string | null {
  const today = salonNow().date;
  if (date < today) return "Escolha uma data a partir de hoje.";
  if (date > addDays(today, MAX_DAYS_AHEAD)) {
    return `Agendamos com até ${MAX_DAYS_AHEAD} dias de antecedência.`;
  }
  return null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatWhatsapp(digits: string): string {
  const local = digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

function maskWhatsapp(value: string): string {
  const digits = onlyDigits(value);
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeCode(): string {
  let code = "VS";
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current === "object" && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Small in-memory rate limiter for the public endpoints. */
export function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
    }
    const entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.status(429).json({ error: "Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente." });
      return;
    }
    next();
  };
}

const lookupLimiter = rateLimit(60, 10 * 60 * 1000);
const bookingLimiter = rateLimit(20, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export function serviceDto(service: typeof services.$inferSelect) {
  return {
    id: service.id,
    name: service.name,
    price: decimal(service.price),
    durationMinutes: service.durationMinutes,
  };
}

export function professionalDto(professional: typeof professionals.$inferSelect) {
  return {
    id: professional.id,
    name: professional.name,
    initials: professional.initials,
    startsAt: professional.startsAt.slice(0, 5),
    endsAt: professional.endsAt.slice(0, 5),
    weekdays: professional.weekdays,
  };
}

async function appointmentDtos(where: SQL | undefined, executor: Executor = db) {
  const rows = await executor
    .select({
      appointment: appointments,
      client: clients,
      service: services,
      professional: professionals,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(where)
    .orderBy(asc(appointments.date), asc(appointments.time));
  const nullable = (value: string | null) => (value === null ? null : decimal(value));
  return rows.map((row) => ({
    id: row.appointment.id,
    code: row.appointment.code,
    clientName: row.client.name,
    whatsapp: row.client.whatsapp,
    date: toIsoDate(row.appointment.date),
    time: row.appointment.time.slice(0, 5),
    status: row.appointment.status,
    professional: professionalDto(row.professional),
    service: serviceDto(row.service),
    expectedAmount: decimal(row.appointment.expectedAmount),
    receivedAmount: nullable(row.appointment.receivedAmount),
    salonShare: nullable(row.appointment.salonShare),
    professionalShare: nullable(row.appointment.professionalShare),
  }));
}

async function appointmentDto(id: number, executor: Executor = db) {
  return (await appointmentDtos(eq(appointments.id, id), executor))[0] ?? null;
}

/** Public responses never expose the full WhatsApp number. */
function publicDto<T extends { whatsapp: string }>(dto: T): T {
  return { ...dto, whatsapp: maskWhatsapp(dto.whatsapp) };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function requireStaff(req: Request, res: Response): Promise<StaffContext | null> {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Faça login para acessar a agenda." });
    return null;
  }
  if (user.role === "admin") {
    return { userId: user.id, email: user.email, name: user.name, role: "admin" };
  }
  if (!user.professionalId) {
    res.status(403).json({ error: "Seu acesso ainda não foi vinculado a uma profissional. Fale com a administração." });
    return null;
  }
  const professional = (
    await db.select().from(professionals).where(eq(professionals.id, user.professionalId)).limit(1)
  )[0];
  if (!professional || !professional.active) {
    res.status(403).json({ error: "Acesso da equipe desativado." });
    return null;
  }
  return { userId: user.id, email: user.email, name: user.name, role: "professional", professionalId: professional.id };
}

export async function requireAdmin(req: Request, res: Response): Promise<StaffContext | null> {
  const context = await requireStaff(req, res);
  if (!context) return null;
  if (context.role !== "admin") {
    res.status(403).json({ error: "Acesso administrativo necessário." });
    return null;
  }
  return context;
}

// ---------------------------------------------------------------------------
// Schedule and availability
// ---------------------------------------------------------------------------

async function getSchedule(professionalId: number, date: string | Date, executor: Executor = db) {
  const dateKey = toIsoDate(date);
  const professional = (
    await executor.select().from(professionals).where(eq(professionals.id, professionalId)).limit(1)
  )[0];
  if (!professional) return null;
  const override = (
    await executor
      .select()
      .from(scheduleOverrides)
      .where(and(eq(scheduleOverrides.professionalId, professionalId), eq(scheduleOverrides.date, dateKey)))
      .limit(1)
  )[0];
  return {
    professional,
    open: override?.open ?? professional.weekdays.includes(dateWeekday(dateKey)),
    startsAt: override?.startsAt?.slice(0, 5) ?? professional.startsAt.slice(0, 5),
    endsAt: override?.endsAt?.slice(0, 5) ?? professional.endsAt.slice(0, 5),
    note: override?.note ?? null,
  };
}

async function getBlockedTimes(professionalId: number, date: string, executor: Executor = db) {
  const rows = await executor
    .select({ time: blockedSlots.time })
    .from(blockedSlots)
    .where(and(eq(blockedSlots.professionalId, professionalId), eq(blockedSlots.date, date)))
    .orderBy(asc(blockedSlots.time));
  return rows.map((row) => row.time.slice(0, 5));
}

/**
 * Builds every slot of the day for a service duration, loading the schedule,
 * blocked times and existing bookings only once. Overlaps are checked against
 * the full duration of each booking and each blocked interval.
 */
async function computeSlots(
  professionalId: number,
  date: string,
  durationMinutes: number,
  options: { ignoreAppointmentId?: number; executor?: Executor } = {},
): Promise<SlotResult[]> {
  const executor = options.executor ?? db;
  const schedule = await getSchedule(professionalId, date, executor);
  if (!schedule || !schedule.open || !schedule.professional.active) return [];

  const blocked = (await getBlockedTimes(professionalId, date, executor)).map(timeToMinutes);
  const booked = (
    await executor
      .select({ id: appointments.id, time: appointments.time, duration: services.durationMinutes })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          eq(appointments.professionalId, professionalId),
          eq(appointments.date, date),
          ne(appointments.status, "cancelled"),
        ),
      )
  )
    .filter((row) => row.id !== options.ignoreAppointmentId)
    .map((row) => ({ start: timeToMinutes(row.time), end: timeToMinutes(row.time) + row.duration }));

  const now = salonNow();
  const slots: SlotResult[] = [];
  const opening = timeToMinutes(schedule.startsAt);
  const closing = timeToMinutes(schedule.endsAt);
  for (let start = opening; start + durationMinutes <= closing; start += SLOT_STEP_MINUTES) {
    const end = start + durationMinutes;
    let reason: string | null = null;
    if (date < now.date || (date === now.date && start <= now.minutes)) reason = "Horário já passou";
    else if (booked.some((item) => start < item.end && end > item.start)) reason = "Reservado";
    else if (blocked.some((item) => start < item + BLOCK_MINUTES && end > item)) reason = "Bloqueado";
    slots.push({ time: minutesToTime(start).slice(0, 5), available: reason === null, reason });
  }
  return slots;
}

async function isSlotFree(
  professionalId: number,
  date: string,
  time: string,
  durationMinutes: number,
  options: { ignoreAppointmentId?: number; executor?: Executor } = {},
) {
  const slots = await computeSlots(professionalId, date, durationMinutes, options);
  return slots.some((slot) => slot.time === time.slice(0, 5) && slot.available);
}

async function lockProfessional(tx: Transaction, professionalId: number) {
  // Serializes bookings for the same professional so two clients cannot
  // reserve overlapping times at the same moment.
  await tx.execute(sql`select pg_advisory_xact_lock(4711, ${professionalId})`);
}

class SlotTakenError extends Error {}

// ---------------------------------------------------------------------------
// Public booking routes
// ---------------------------------------------------------------------------

router.get("/services", async (_req, res) => {
  const rows = await db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.id));
  res.json(rows.map(serviceDto));
});

router.get("/professionals", async (_req, res) => {
  const rows = await db
    .select()
    .from(professionals)
    .where(eq(professionals.active, true))
    .orderBy(asc(professionals.id));
  res.json(rows.map(professionalDto));
});

router.get("/availability", async (req, res) => {
  const parsed = GetAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parâmetros inválidos." });
    return;
  }
  const { serviceId, professionalId } = parsed.data;
  const date = toIsoDate(parsed.data.date);
  const service = (await db.select().from(services).where(eq(services.id, serviceId)).limit(1))[0];
  const professional = (
    await db.select().from(professionals).where(eq(professionals.id, professionalId)).limit(1)
  )[0];
  if (!service || !professional || !service.active || !professional.active) {
    res.status(404).json({ error: "Serviço ou profissional não encontrado." });
    return;
  }
  const slots = bookingDateError(date) ? [] : await computeSlots(professionalId, date, service.durationMinutes);
  res.json({ date, professional: professionalDto(professional), slots });
});

router.post("/appointments", bookingLimiter, async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira os dados do agendamento." });
    return;
  }
  const input = parsed.data;
  const date = toIsoDate(input.date);
  const time = normalizeTime(input.time);
  const clientName = input.clientName.trim().replace(/\s+/g, " ").slice(0, 80);
  const whatsappDigits = onlyDigits(input.whatsapp);
  if (!time) {
    res.status(400).json({ error: "Horário inválido." });
    return;
  }
  if (clientName.length < 2) {
    res.status(400).json({ error: "Informe seu nome." });
    return;
  }
  if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
    res.status(400).json({ error: "Informe um WhatsApp com DDD." });
    return;
  }
  const dateError = bookingDateError(date);
  if (dateError) {
    res.status(400).json({ error: dateError });
    return;
  }
  const service = (await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1))[0];
  if (!service || !service.active) {
    res.status(404).json({ error: "Serviço não encontrado." });
    return;
  }

  try {
    const id = await db.transaction(async (tx) => {
      await lockProfessional(tx, input.professionalId);
      if (!(await isSlotFree(input.professionalId, date, time, service.durationMinutes, { executor: tx }))) {
        throw new SlotTakenError();
      }
      const whatsapp = formatWhatsapp(whatsappDigits);
      const client =
        (
          await tx
            .select()
            .from(clients)
            .where(
              and(
                sql`regexp_replace(${clients.whatsapp}, '\\D', '', 'g') = ${whatsappDigits}`,
                sql`lower(${clients.name}) = lower(${clientName})`,
              ),
            )
            .limit(1)
        )[0] ?? (await tx.insert(clients).values({ name: clientName, whatsapp }).returning())[0];

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const code = makeCode();
        const exists = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(eq(appointments.code, code))
          .limit(1);
        if (exists[0]) continue;
        const created = (
          await tx
            .insert(appointments)
            .values({
              code,
              clientId: client.id,
              serviceId: service.id,
              professionalId: input.professionalId,
              date,
              time,
              status: "scheduled",
              expectedAmount: service.price,
            })
            .returning()
        )[0];
        return created.id;
      }
      throw new Error("Não foi possível gerar um código de reserva.");
    });
    const dto = await appointmentDto(id);
    res.status(201).json(dto ? publicDto(dto) : null);
  } catch (error) {
    if (error instanceof SlotTakenError || isUniqueViolation(error)) {
      res.status(409).json({ error: "Esse horário acabou de ser reservado. Escolha outro." });
      return;
    }
    throw error;
  }
});

async function findByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length < 6) return null;
  return (await db.select().from(appointments).where(eq(appointments.code, code)).limit(1))[0] ?? null;
}

function isPast(date: string | Date, time: string): boolean {
  const now = salonNow();
  const day = toIsoDate(date);
  return day < now.date || (day === now.date && timeToMinutes(time) <= now.minutes);
}

router.get("/appointments/:code", lookupLimiter, async (req, res) => {
  const parsed = GetAppointmentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Código inválido." });
    return;
  }
  const row = await findByCode(parsed.data.code);
  const dto = row ? await appointmentDto(row.id) : null;
  if (!dto) {
    res.status(404).json({ error: "Agendamento não encontrado." });
    return;
  }
  res.json(publicDto(dto));
});

router.patch("/appointments/:code", lookupLimiter, async (req, res) => {
  const params = RescheduleAppointmentParams.safeParse(req.params);
  const body = RescheduleAppointmentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de reagendamento inválidos." });
    return;
  }
  const current = await findByCode(params.data.code);
  if (!current || current.status === "cancelled") {
    res.status(404).json({ error: "Agendamento não encontrado." });
    return;
  }
  if (current.status !== "scheduled" || isPast(current.date, current.time)) {
    res.status(409).json({ error: "Este atendimento não pode mais ser remarcado pelo site. Fale com o instituto." });
    return;
  }
  const date = toIsoDate(body.data.date);
  const time = normalizeTime(body.data.time);
  const dateError = bookingDateError(date);
  if (!time || dateError) {
    res.status(400).json({ error: dateError ?? "Horário inválido." });
    return;
  }
  const service = (await db.select().from(services).where(eq(services.id, current.serviceId)).limit(1))[0];
  if (!service) {
    res.status(404).json({ error: "Serviço não encontrado." });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await lockProfessional(tx, body.data.professionalId);
      const free = await isSlotFree(body.data.professionalId, date, time, service.durationMinutes, {
        ignoreAppointmentId: current.id,
        executor: tx,
      });
      if (!free) throw new SlotTakenError();
      await tx
        .update(appointments)
        .set({ professionalId: body.data.professionalId, date, time, updatedAt: new Date() })
        .where(eq(appointments.id, current.id));
    });
  } catch (error) {
    if (error instanceof SlotTakenError || isUniqueViolation(error)) {
      res.status(409).json({ error: "O novo horário não está disponível. Escolha outro." });
      return;
    }
    throw error;
  }
  const dto = await appointmentDto(current.id);
  res.json(dto ? publicDto(dto) : null);
});

router.delete("/appointments/:code", lookupLimiter, async (req, res) => {
  const parsed = GetAppointmentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Código inválido." });
    return;
  }
  const current = await findByCode(parsed.data.code);
  if (!current) {
    res.status(404).json({ error: "Agendamento não encontrado." });
    return;
  }
  if (current.status !== "cancelled") {
    if (current.status !== "scheduled" || isPast(current.date, current.time)) {
      res.status(409).json({ error: "Este atendimento não pode mais ser cancelado pelo site. Fale com o instituto." });
      return;
    }
    await db
      .update(appointments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(appointments.id, current.id));
  }
  const dto = await appointmentDto(current.id);
  res.json(dto ? publicDto(dto) : null);
});

// ---------------------------------------------------------------------------
// Staff routes
// ---------------------------------------------------------------------------

router.get("/staff/me", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const professional = context.professionalId
    ? (await db.select().from(professionals).where(eq(professionals.id, context.professionalId)).limit(1))[0]
    : null;
  res.json({
    role: context.role,
    professional: professional ? professionalDto(professional) : null,
    displayName: professional?.name ?? context.name,
    email: context.email,
  });
});

router.get("/staff/agenda", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const parsed = GetStaffAgendaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Data inválida." });
    return;
  }
  const professionalId = context.professionalId ?? parsed.data.professionalId;
  const date = toIsoDate(parsed.data.date);
  res.json(
    await appointmentDtos(
      and(
        eq(appointments.date, date),
        professionalId ? eq(appointments.professionalId, professionalId) : undefined,
      ),
    ),
  );
});

router.patch("/staff/appointments/:id/status", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const params = UpdateAppointmentStatusParams.safeParse(req.params);
  const body = UpdateAppointmentStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }
  if (body.data.receivedAmount != null && (body.data.receivedAmount < 0 || body.data.receivedAmount > 100000)) {
    res.status(400).json({ error: "Valor recebido inválido." });
    return;
  }
  const current = (await db.select().from(appointments).where(eq(appointments.id, params.data.id)).limit(1))[0];
  if (!current || (context.professionalId && current.professionalId !== context.professionalId)) {
    res.status(404).json({ error: "Agendamento não encontrado." });
    return;
  }
  const share = (await getSalonSettings()).salonSharePercent / 100;
  const completing = body.data.status === "completed";
  const received = completing ? decimal(body.data.receivedAmount ?? current.expectedAmount) : null;
  await db
    .update(appointments)
    .set({
      status: body.data.status,
      // Values only count for completed visits; clear them when the status
      // moves away from "completed" so the financial summary stays correct.
      receivedAmount: received === null ? null : money(received),
      salonShare: received === null ? null : money(received * share),
      professionalShare: received === null ? null : money(received * (1 - share)),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, current.id));
  res.json(await appointmentDto(current.id));
});

async function scheduleResponse(professionalId: number, date: string) {
  const schedule = await getSchedule(professionalId, date);
  if (!schedule) return null;
  return {
    date,
    professionalId,
    open: schedule.open,
    startsAt: schedule.startsAt,
    endsAt: schedule.endsAt,
    note: schedule.note,
    blockedTimes: await getBlockedTimes(professionalId, date),
  };
}

router.get("/staff/schedule", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const parsed = GetScheduleSettingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Data inválida." });
    return;
  }
  const professionalId = context.professionalId ?? parsed.data.professionalId;
  if (!professionalId) {
    res.status(400).json({ error: "Selecione uma profissional." });
    return;
  }
  const response = await scheduleResponse(professionalId, toIsoDate(parsed.data.date));
  if (!response) {
    res.status(404).json({ error: "Profissional não encontrada." });
    return;
  }
  res.json(response);
});

router.patch("/staff/schedule", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const parsed = UpdateScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Configuração de agenda inválida." });
    return;
  }
  const professionalId = context.professionalId ?? parsed.data.professionalId;
  if (!professionalId) {
    res.status(400).json({ error: "Selecione uma profissional." });
    return;
  }
  const startsAt = parsed.data.startsAt ? normalizeTime(parsed.data.startsAt) : null;
  const endsAt = parsed.data.endsAt ? normalizeTime(parsed.data.endsAt) : null;
  if ((parsed.data.startsAt && !startsAt) || (parsed.data.endsAt && !endsAt)) {
    res.status(400).json({ error: "Horário de expediente inválido." });
    return;
  }
  if (startsAt && endsAt && timeToMinutes(startsAt) >= timeToMinutes(endsAt)) {
    res.status(400).json({ error: "O horário de início precisa ser antes do fim." });
    return;
  }
  const date = toIsoDate(parsed.data.date);
  const existingClients = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.professionalId, professionalId),
        eq(appointments.date, date),
        inArray(appointments.status, ["scheduled", "arrived"]),
      ),
    );
  if (!parsed.data.open && existingClients.length > 0) {
    res.status(409).json({
      error: `Este dia tem ${existingClients.length} cliente(s) agendada(s). Remarque ou cancele antes de fechar.`,
      affectedCount: existingClients.length,
    });
    return;
  }
  const values = { open: parsed.data.open, startsAt, endsAt, note: parsed.data.note?.trim() || null };
  await db
    .insert(scheduleOverrides)
    .values({ professionalId, date, ...values })
    .onConflictDoUpdate({ target: [scheduleOverrides.professionalId, scheduleOverrides.date], set: values });
  res.json(await scheduleResponse(professionalId, date));
});

router.patch("/staff/slots", async (req, res) => {
  const context = await requireStaff(req, res);
  if (!context) return;
  const parsed = UpdateSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Horário inválido." });
    return;
  }
  const professionalId = context.professionalId ?? parsed.data.professionalId;
  const date = toIsoDate(parsed.data.date);
  const time = normalizeTime(parsed.data.time);
  if (!professionalId) {
    res.status(400).json({ error: "Selecione uma profissional." });
    return;
  }
  if (!time) {
    res.status(400).json({ error: "Horário inválido." });
    return;
  }
  if (parsed.data.blocked) {
    await db.insert(blockedSlots).values({ professionalId, date, time }).onConflictDoNothing();
  } else {
    await db
      .delete(blockedSlots)
      .where(
        and(
          eq(blockedSlots.professionalId, professionalId),
          eq(blockedSlots.date, date),
          eq(blockedSlots.time, time),
        ),
      );
  }
  res.json({
    time: time.slice(0, 5),
    available: !parsed.data.blocked,
    reason: parsed.data.blocked ? "Bloqueado" : null,
  });
});

router.get("/admin/summary", async (req, res) => {
  const context = await requireAdmin(req, res);
  if (!context) return;
  const parsed = GetScheduleSettingsQueryParams.pick({ date: true }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Data inválida." });
    return;
  }
  const date = toIsoDate(parsed.data.date);
  const rows = await db.select().from(appointments).where(eq(appointments.date, date));
  const SALON_SHARE = (await getSalonSettings()).salonSharePercent / 100;
  const completed = rows.filter((row) => row.status === "completed");
  const team = await db
    .select()
    .from(professionals)
    .where(eq(professionals.active, true))
    .orderBy(asc(professionals.id));
  const sumReceived = (items: typeof rows) => items.reduce((sum, row) => sum + decimal(row.receivedAmount), 0);
  const finance = team.map((professional) => {
    const own = completed.filter((row) => row.professionalId === professional.id);
    const totalReceived = sumReceived(own);
    return {
      professional: professionalDto(professional),
      completed: own.length,
      totalReceived,
      salonShare: totalReceived * SALON_SHARE,
      professionalShare: totalReceived * (1 - SALON_SHARE),
    };
  });
  const totalReceived = sumReceived(completed);
  res.json({
    date,
    appointments: rows.filter((row) => row.status !== "cancelled").length,
    completed: completed.length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    noShows: rows.filter((row) => row.status === "no_show").length,
    totalReceived,
    salonShare: totalReceived * SALON_SHARE,
    professionalShare: totalReceived * (1 - SALON_SHARE),
    byProfessional: finance,
  });
});

export default router;
