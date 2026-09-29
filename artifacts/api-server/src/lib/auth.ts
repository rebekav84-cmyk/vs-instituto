import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, staffUsers, type StaffUser } from "@workspace/db";
import { logger } from "./logger";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "vs_session";
const SESSION_DAYS = 30;
const isProduction = process.env.NODE_ENV === "production";

const SESSION_SECRET = (() => {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres em produção.");
  }
  logger.warn("SESSION_SECRET não definida: usando uma chave temporária (os logins caem ao reiniciar).");
  return randomBytes(32).toString("hex");
})();

// ---------------------------------------------------------------------------
// Senhas (scrypt, sem dependências externas)
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltB64, keyB64] = stored.split("$");
  if (algorithm !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (password.length > 200) return "Senha longa demais.";
  return null;
}

// ---------------------------------------------------------------------------
// Sessão em cookie assinado (HMAC)
// ---------------------------------------------------------------------------

type SessionPayload = { u: number; v: number; exp: number };

function sign(value: string): string {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.u !== "number" || typeof payload.v !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export function startSession(res: Response, user: StaffUser) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, encodeSession({ u: user.id, v: user.tokenVersion, exp: Date.now() + maxAge }), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge,
    path: "/",
  });
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" });
}

/** Usuário logado e ativo, ou null. */
export async function currentUser(req: Request): Promise<StaffUser | null> {
  const session = decodeSession(readCookie(req, SESSION_COOKIE));
  if (!session) return null;
  const user = (
    await db
      .select()
      .from(staffUsers)
      .where(and(eq(staffUsers.id, session.u), eq(staffUsers.active, true)))
      .limit(1)
  )[0];
  if (!user || user.tokenVersion !== session.v) return null;
  return user;
}

// ---------------------------------------------------------------------------
// Conta inicial da administração
// ---------------------------------------------------------------------------

/**
 * Cria a conta da administração a partir de ADMIN_EMAIL / ADMIN_PASSWORD
 * quando ainda não existe nenhuma. Com ADMIN_RESET_PASSWORD=true, redefine a
 * senha dessa conta (útil se a senha for esquecida).
 */
export async function ensureAdminAccount() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const existingAdmin = (await db.select().from(staffUsers).where(eq(staffUsers.role, "admin")).limit(1))[0];

  if (!email || !password) {
    if (!existingAdmin) {
      logger.warn("Nenhuma conta de administração. Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar a primeira.");
    }
    return;
  }
  const problem = passwordProblem(password);
  if (problem) {
    logger.error(`ADMIN_PASSWORD inválida: ${problem}`);
    return;
  }
  const sameEmail = (await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1))[0];
  if (!sameEmail) {
    if (existingAdmin) return;
    await db.insert(staffUsers).values({
      email,
      name: process.env.ADMIN_NAME?.trim() || "Administração",
      passwordHash: await hashPassword(password),
      role: "admin",
    });
    logger.info({ email }, "Conta de administração criada.");
    return;
  }
  if (process.env.ADMIN_RESET_PASSWORD === "true") {
    await db
      .update(staffUsers)
      .set({
        passwordHash: await hashPassword(password),
        role: "admin",
        active: true,
        tokenVersion: sameEmail.tokenVersion + 1,
      })
      .where(eq(staffUsers.id, sameEmail.id));
    logger.warn({ email }, "Senha da administração redefinida por ADMIN_RESET_PASSWORD. Remova essa variável agora.");
  }
}
