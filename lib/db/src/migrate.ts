import type { Pool } from "pg";

/**
 * Cria as tabelas que ainda não existem. Roda a cada inicialização da API e
 * nunca apaga dados: só usa CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 * Mantenha em sincronia com ./schema/index.ts.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vs_services (
    id serial PRIMARY KEY,
    name text NOT NULL,
    price numeric(10, 2) NOT NULL,
    duration_minutes integer NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS vs_professionals (
    id serial PRIMARY KEY,
    name text NOT NULL,
    initials text NOT NULL,
    starts_at time NOT NULL,
    ends_at time NOT NULL DEFAULT '18:00',
    weekdays integer[] NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  `ALTER TABLE vs_professionals ADD COLUMN IF NOT EXISTS ends_at time NOT NULL DEFAULT '18:00'`,
  `CREATE TABLE IF NOT EXISTS vs_schedule_overrides (
    id serial PRIMARY KEY,
    professional_id integer NOT NULL REFERENCES vs_professionals(id),
    date date NOT NULL,
    open boolean NOT NULL,
    starts_at time,
    ends_at time,
    note text
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vs_schedule_professional_date ON vs_schedule_overrides (professional_id, date)`,
  `CREATE TABLE IF NOT EXISTS vs_blocked_slots (
    id serial PRIMARY KEY,
    professional_id integer NOT NULL REFERENCES vs_professionals(id),
    date date NOT NULL,
    time time NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vs_blocked_slot_unique ON vs_blocked_slots (professional_id, date, time)`,
  `CREATE TABLE IF NOT EXISTS vs_clients (
    id serial PRIMARY KEY,
    name text NOT NULL,
    whatsapp text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS vs_appointments (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    client_id integer NOT NULL REFERENCES vs_clients(id),
    service_id integer NOT NULL REFERENCES vs_services(id),
    professional_id integer NOT NULL REFERENCES vs_professionals(id),
    date date NOT NULL,
    time time NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    expected_amount numeric(10, 2) NOT NULL,
    received_amount numeric(10, 2),
    salon_share numeric(10, 2),
    professional_share numeric(10, 2),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vs_active_appointment_slot ON vs_appointments (professional_id, date, time) WHERE status <> 'cancelled'`,
  `CREATE INDEX IF NOT EXISTS vs_appointments_date ON vs_appointments (date)`,
  `CREATE TABLE IF NOT EXISTS vs_staff_users (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    professional_id integer REFERENCES vs_professionals(id),
    active boolean NOT NULL DEFAULT true,
    token_version integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS vs_settings (
    key text PRIMARY KEY,
    value text NOT NULL
  )`,
];

export async function ensureSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Evita duas instâncias criando tabelas ao mesmo tempo.
    await client.query("SELECT pg_advisory_xact_lock(4711, 0)");
    for (const statement of STATEMENTS) await client.query(statement);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
