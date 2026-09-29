import { ensureSchema, pool } from "@workspace/db";
import app from "./app";
import { ensureAdminAccount } from "./lib/auth";
import { logger } from "./lib/logger";

const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`PORT inválida: "${process.env.PORT}"`);
}

async function main() {
  await ensureSchema(pool);
  await ensureAdminAccount();
  const server = app.listen(port, "0.0.0.0", (error) => {
    if (error) {
      logger.error({ err: error }, "Não foi possível abrir a porta");
      process.exit(1);
    }
    logger.info({ port }, "Servidor no ar");
  });
  const shutdown = () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error({ err: error }, "Falha ao iniciar");
  process.exit(1);
});
