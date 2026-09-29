import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL não definida. Configure a URL do PostgreSQL (ex.: Neon) nas variáveis de ambiente.",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

// Bancos gratuitos (Neon) desligam conexões ociosas; sem este handler o
// processo cairia com "Connection terminated unexpectedly".
pool.on("error", (error) => {
  console.error("[db] conexão ociosa encerrada pelo servidor:", error.message);
});

export const db = drizzle(pool, { schema });

export { ensureSchema } from "./migrate";
export * from "./schema";
