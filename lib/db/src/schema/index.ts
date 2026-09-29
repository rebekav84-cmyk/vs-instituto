import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const services = pgTable("vs_services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  active: boolean("active").notNull().default(true),
});

export const professionals = pgTable("vs_professionals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  startsAt: time("starts_at").notNull(),
  endsAt: time("ends_at").notNull().default("18:00"),
  weekdays: integer("weekdays").array().notNull(),
  active: boolean("active").notNull().default(true),
});

/** Contas de acesso da equipe (administração e profissionais). */
export const staffUsers = pgTable("vs_staff_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  professionalId: integer("professional_id").references(() => professionals.id),
  active: boolean("active").notNull().default(true),
  /** Incrementado ao trocar a senha: derruba as sessões antigas. */
  tokenVersion: integer("token_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Informações do salão exibidas no site (chave/valor). */
export const settings = pgTable("vs_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const scheduleOverrides = pgTable(
  "vs_schedule_overrides",
  {
    id: serial("id").primaryKey(),
    professionalId: integer("professional_id")
      .notNull()
      .references(() => professionals.id),
    date: date("date").notNull(),
    open: boolean("open").notNull(),
    startsAt: time("starts_at"),
    endsAt: time("ends_at"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("vs_schedule_professional_date").on(
      table.professionalId,
      table.date,
    ),
  ],
);

export const blockedSlots = pgTable(
  "vs_blocked_slots",
  {
    id: serial("id").primaryKey(),
    professionalId: integer("professional_id")
      .notNull()
      .references(() => professionals.id),
    date: date("date").notNull(),
    time: time("time").notNull(),
  },
  (table) => [
    uniqueIndex("vs_blocked_slot_unique").on(
      table.professionalId,
      table.date,
      table.time,
    ),
  ],
);

export const clients = pgTable("vs_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appointments = pgTable(
  "vs_appointments",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    professionalId: integer("professional_id")
      .notNull()
      .references(() => professionals.id),
    date: date("date").notNull(),
    time: time("time").notNull(),
    status: text("status").notNull().default("scheduled"),
    expectedAmount: numeric("expected_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    receivedAmount: numeric("received_amount", {
      precision: 10,
      scale: 2,
    }),
    salonShare: numeric("salon_share", { precision: 10, scale: 2 }),
    professionalShare: numeric("professional_share", {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("vs_active_appointment_slot")
      .on(table.professionalId, table.date, table.time)
      .where(sql`${table.status} <> 'cancelled'`),
    index("vs_appointments_date").on(table.date),
  ],
);

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
});
export const insertProfessionalSchema = createInsertSchema(professionals).omit(
  { id: true },
);
export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Service = typeof services.$inferSelect;
export type Professional = typeof professionals.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;