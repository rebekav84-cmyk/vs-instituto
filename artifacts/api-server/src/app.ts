import fs from "node:fs";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Render, Railway e similares ficam atrás de um proxy: necessário para o IP
// real (limite de tentativas) e para o cookie "secure".
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => !req.url?.startsWith("/api") },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

app.use(express.json({ limit: "100kb" }));
app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

// Em produção a própria API entrega o site (pasta gerada pelo build do Vite).
const staticDir =
  process.env.STATIC_DIR ?? path.resolve(import.meta.dirname, "../../vs-instituto/dist/public");
if (fs.existsSync(path.join(staticDir, "index.html"))) {
  app.use(
    express.static(staticDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  logger.warn({ staticDir }, "Site não encontrado (rode o build do site). Servindo só a API.");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err: error }, "Erro inesperado");
  if (res.headersSent) return;
  res.status(500).json({ error: "Algo deu errado. Tente novamente em instantes." });
});

export default app;
