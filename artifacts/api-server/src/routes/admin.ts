import { Router, type IRouter } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, professionals, services, staffUsers } from "@workspace/db";
import {
  ChangePasswordBody,
  CreateAccountBody,
  CreateProfessionalBody,
  CreateServiceBody,
  LoginBody,
  UpdateAccountBody,
  UpdateAccountParams,
  UpdateProfessionalBody,
  UpdateProfessionalParams,
  UpdateServiceBody,
  UpdateServiceParams,
  UpdateSettingsBody,
} from "@workspace/api-zod";
import {
  currentUser,
  endSession,
  hashPassword,
  passwordProblem,
  startSession,
  verifyPassword,
} from "../lib/auth";
import { getSalonSettings, saveSalonSettings } from "../lib/settings";
import { professionalDto, rateLimit, requireAdmin } from "./vs";

const router: IRouter = Router();
const loginLimiter = rateLimit(10, 15 * 60 * 1000);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

function normalizeTime(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]}:${match[2]}:00`;
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

function adminServiceDto(service: typeof services.$inferSelect) {
  return {
    id: service.id,
    name: service.name,
    price: Number(service.price),
    durationMinutes: service.durationMinutes,
    active: service.active,
  };
}

function adminProfessionalDto(professional: typeof professionals.$inferSelect) {
  return { ...professionalDto(professional), active: professional.active };
}

function accountDto(user: typeof staffUsers.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "admin" | "professional",
    professionalId: user.professionalId,
    active: user.active,
  };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Informe e-mail e senha." });
    return;
  }
  const email = normalizeEmail(parsed.data.email);
  const user = (await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1))[0];
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid || !user.active) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }
  startSession(res, user);
  const professional = user.professionalId
    ? (await db.select().from(professionals).where(eq(professionals.id, user.professionalId)).limit(1))[0]
    : undefined;
  res.json({
    role: user.role,
    professional: professional ? professionalDto(professional) : null,
    displayName: professional?.name ?? user.name,
    email: user.email,
  });
});

router.post("/auth/logout", (_req, res) => {
  endSession(res);
  res.json({ status: "ok" });
});

router.post("/auth/password", async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Faça login novamente." });
    return;
  }
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preencha a senha atual e a nova." });
    return;
  }
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "A senha atual não confere." });
    return;
  }
  const problem = passwordProblem(parsed.data.newPassword);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const updated = (
    await db
      .update(staffUsers)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), tokenVersion: user.tokenVersion + 1 })
      .where(eq(staffUsers.id, user.id))
      .returning()
  )[0];
  startSession(res, updated);
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Informações do salão
// ---------------------------------------------------------------------------

router.get("/settings", async (_req, res) => {
  res.json(await getSalonSettings());
});

router.put("/admin/settings", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira as informações do salão." });
    return;
  }
  const data = parsed.data;
  if (data.salonSharePercent < 0 || data.salonSharePercent > 100) {
    res.status(400).json({ error: "A participação do salão deve ficar entre 0% e 100%." });
    return;
  }
  const clean = (value: string, max: number) => value.trim().slice(0, max);
  res.json(
    await saveSalonSettings({
      name: clean(data.name, 80) || "VS Instituto de Beleza",
      whatsapp: data.whatsapp.replace(/\D/g, "").slice(0, 13),
      address: clean(data.address, 200),
      instagram: clean(data.instagram, 60).replace(/^@/, ""),
      about: clean(data.about, 600),
      salonSharePercent: Math.round(data.salonSharePercent * 100) / 100,
    }),
  );
});

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

function serviceProblem(data: { name?: string; price?: number; durationMinutes?: number }, creating: boolean) {
  if ((creating || data.name !== undefined) && (!data.name || data.name.trim().length < 2)) return "Informe o nome do serviço.";
  if ((creating || data.price !== undefined) && (data.price === undefined || data.price < 0 || data.price > 100000))
    return "Informe um preço válido.";
  if (
    (creating || data.durationMinutes !== undefined) &&
    (data.durationMinutes === undefined || data.durationMinutes < 15 || data.durationMinutes > 600 || data.durationMinutes % 15 !== 0)
  )
    return "A duração deve ser em blocos de 15 minutos (15 a 600).";
  return null;
}

router.get("/admin/services", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(services).orderBy(asc(services.name));
  res.json(rows.map(adminServiceDto));
});

router.post("/admin/services", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateServiceBody.safeParse(req.body);
  const problem = parsed.success ? serviceProblem(parsed.data, true) : "Confira os dados do serviço.";
  if (!parsed.success || problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const created = (
    await db
      .insert(services)
      .values({
        name: parsed.data.name!.trim(),
        price: String(parsed.data.price),
        durationMinutes: parsed.data.durationMinutes!,
        active: parsed.data.active ?? true,
      })
      .returning()
  )[0];
  res.status(201).json(adminServiceDto(created));
});

router.patch("/admin/services/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const params = UpdateServiceParams.safeParse(req.params);
  const parsed = UpdateServiceBody.safeParse(req.body);
  const problem = parsed.success ? serviceProblem(parsed.data, false) : "Confira os dados do serviço.";
  if (!params.success || !parsed.success || problem) {
    res.status(400).json({ error: problem ?? "Serviço inválido." });
    return;
  }
  const data = parsed.data;
  const updated = (
    await db
      .update(services)
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.price !== undefined ? { price: String(data.price) } : {}),
        ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      })
      .where(eq(services.id, params.data.id))
      .returning()
  )[0];
  if (!updated) {
    res.status(404).json({ error: "Serviço não encontrado." });
    return;
  }
  res.json(adminServiceDto(updated));
});

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------

type ProfessionalData = {
  name?: string;
  initials?: string;
  startsAt?: string;
  endsAt?: string;
  weekdays?: number[];
  active?: boolean;
};

function professionalValues(data: ProfessionalData, creating: boolean) {
  const values: Partial<typeof professionals.$inferInsert> = {};
  if (creating || data.name !== undefined) {
    const name = data.name?.trim().replace(/\s+/g, " ") ?? "";
    if (name.length < 2) return { error: "Informe o nome da profissional." };
    values.name = name.slice(0, 80);
  }
  if (data.initials !== undefined || creating) {
    const initials = (data.initials?.trim() || makeInitials(values.name ?? data.name ?? "")).toUpperCase().slice(0, 3);
    if (!initials) return { error: "Informe as iniciais." };
    values.initials = initials;
  }
  const startsAt = data.startsAt !== undefined || creating ? normalizeTime(data.startsAt ?? "09:00") : undefined;
  const endsAt = data.endsAt !== undefined || creating ? normalizeTime(data.endsAt ?? "18:00") : undefined;
  if (startsAt === null || endsAt === null) return { error: "Horário de trabalho inválido." };
  if (startsAt) values.startsAt = startsAt;
  if (endsAt) values.endsAt = endsAt;
  if (data.weekdays !== undefined || creating) {
    const weekdays = [...new Set(data.weekdays ?? [1, 2, 3, 4, 5, 6])].filter((day) => Number.isInteger(day) && day >= 0 && day <= 6).sort();
    if (!weekdays.length) return { error: "Escolha pelo menos um dia de trabalho." };
    values.weekdays = weekdays;
  }
  if (data.active !== undefined) values.active = data.active;
  return { values };
}

router.get("/admin/professionals", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(professionals).orderBy(asc(professionals.name));
  res.json(rows.map(adminProfessionalDto));
});

router.post("/admin/professionals", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateProfessionalBody.safeParse(req.body);
  const result = parsed.success ? professionalValues(parsed.data, true) : { error: "Confira os dados da profissional." };
  if (!parsed.success || "error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  const values = result.values as typeof professionals.$inferInsert;
  if (values.startsAt! >= values.endsAt!) {
    res.status(400).json({ error: "O início do expediente precisa ser antes do fim." });
    return;
  }
  const created = (await db.insert(professionals).values(values).returning())[0];
  res.status(201).json(adminProfessionalDto(created));
});

router.patch("/admin/professionals/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const params = UpdateProfessionalParams.safeParse(req.params);
  const parsed = UpdateProfessionalBody.safeParse(req.body);
  const result = parsed.success ? professionalValues(parsed.data, false) : { error: "Confira os dados da profissional." };
  if (!params.success || !parsed.success || "error" in result) {
    res.status(400).json({ error: "error" in result ? result.error : "Profissional inválida." });
    return;
  }
  const current = (await db.select().from(professionals).where(eq(professionals.id, params.data.id)).limit(1))[0];
  if (!current) {
    res.status(404).json({ error: "Profissional não encontrada." });
    return;
  }
  const merged = { ...current, ...result.values };
  if (merged.startsAt.slice(0, 5) >= merged.endsAt.slice(0, 5)) {
    res.status(400).json({ error: "O início do expediente precisa ser antes do fim." });
    return;
  }
  const updated = (
    await db.update(professionals).set(result.values).where(eq(professionals.id, current.id)).returning()
  )[0];
  res.json(adminProfessionalDto(updated));
});

// ---------------------------------------------------------------------------
// Acessos da equipe
// ---------------------------------------------------------------------------

async function professionalExists(id: number | null | undefined) {
  if (!id) return false;
  return Boolean((await db.select({ id: professionals.id }).from(professionals).where(eq(professionals.id, id)).limit(1))[0]);
}

router.get("/admin/accounts", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(staffUsers).orderBy(asc(staffUsers.name));
  res.json(rows.map(accountDto));
});

router.post("/admin/accounts", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira os dados do acesso." });
    return;
  }
  const data = parsed.data;
  const email = normalizeEmail(data.email);
  const problem =
    data.name.trim().length < 2
      ? "Informe o nome."
      : !EMAIL_PATTERN.test(email)
        ? "Informe um e-mail válido."
        : passwordProblem(data.password) ??
          (data.role === "professional" && !(await professionalExists(data.professionalId))
            ? "Escolha a profissional desse acesso."
            : null);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  if ((await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, email)).limit(1))[0]) {
    res.status(409).json({ error: "Já existe um acesso com esse e-mail." });
    return;
  }
  const created = (
    await db
      .insert(staffUsers)
      .values({
        email,
        name: data.name.trim().slice(0, 80),
        passwordHash: await hashPassword(data.password),
        role: data.role,
        professionalId: data.role === "professional" ? data.professionalId! : null,
      })
      .returning()
  )[0];
  res.status(201).json(accountDto(created));
});

router.patch("/admin/accounts/:id", async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const params = UpdateAccountParams.safeParse(req.params);
  const parsed = UpdateAccountBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Confira os dados do acesso." });
    return;
  }
  const current = (await db.select().from(staffUsers).where(eq(staffUsers.id, params.data.id)).limit(1))[0];
  if (!current) {
    res.status(404).json({ error: "Acesso não encontrado." });
    return;
  }
  const data = parsed.data;
  const role = data.role ?? (current.role as "admin" | "professional");
  const professionalId = role === "admin" ? null : data.professionalId !== undefined ? data.professionalId : current.professionalId;
  const active = data.active ?? current.active;
  const email = data.email !== undefined ? normalizeEmail(data.email) : current.email;

  if (data.name !== undefined && data.name.trim().length < 2) {
    res.status(400).json({ error: "Informe o nome." });
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: "Informe um e-mail válido." });
    return;
  }
  if (data.password !== undefined && data.password !== "") {
    const problem = passwordProblem(data.password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }
  }
  if (role === "professional" && !(await professionalExists(professionalId))) {
    res.status(400).json({ error: "Escolha a profissional desse acesso." });
    return;
  }
  if (email !== current.email) {
    const taken = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.email, email), ne(staffUsers.id, current.id)))
      .limit(1);
    if (taken[0]) {
      res.status(409).json({ error: "Já existe um acesso com esse e-mail." });
      return;
    }
  }
  // Nunca deixar o sistema sem nenhuma administração ativa.
  if (current.role === "admin" && (role !== "admin" || !active)) {
    const otherAdmins = await db
      .select({ id: staffUsers.id })
      .from(staffUsers)
      .where(and(eq(staffUsers.role, "admin"), eq(staffUsers.active, true), ne(staffUsers.id, current.id)));
    if (!otherAdmins.length) {
      res.status(409).json({ error: "Este é o único acesso de administração ativo; ele não pode ser desativado." });
      return;
    }
  }
  const passwordChanged = data.password !== undefined && data.password !== "";
  const updated = (
    await db
      .update(staffUsers)
      .set({
        name: data.name?.trim().slice(0, 80) ?? current.name,
        email,
        role,
        professionalId,
        active,
        ...(passwordChanged ? { passwordHash: await hashPassword(data.password!) } : {}),
        // Desativar ou trocar a senha derruba as sessões abertas desse acesso.
        tokenVersion: passwordChanged || !active || role !== current.role ? current.tokenVersion + 1 : current.tokenVersion,
      })
      .where(eq(staffUsers.id, current.id))
      .returning()
  )[0];
  if (updated.id === admin.userId && updated.tokenVersion !== current.tokenVersion) startSession(res, updated);
  res.json(accountDto(updated));
});

export default router;
