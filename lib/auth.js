import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, rpc, HttpError } from "./db.js";
const cookieName =
  process.env.NODE_ENV === "production" ? "__Host-apt-admin" : "apt-admin";
export const hash = (text) => createHash("sha256").update(text).digest("hex");
export function matches(a, b) {
  return (
    !!a && !!b && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
  );
}
function token(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || ""
  );
}
export async function session(req) {
  const t = token(req);
  if (!/^[a-f0-9]{64}$/.test(t)) return false;
  return (
    (
      await db(
        `admin_sessions?token_hash=eq.${hash(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`,
      )
    ).length > 0
  );
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (
    !origin ||
    new URL(origin).host !== host ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    throw new HttpError(403, "Origen no permitido.");
}
export async function admin(req) {
  sameOrigin(req);
  if (!(await session(req)))
    throw new HttpError(401, "Introduce la clave de administrador.");
}
export async function limit(key, count = 30, seconds = 60) {
  if (
    !(await rpc("take_rate", {
      p_key: key,
      p_limit: count,
      p_seconds: seconds,
    }))
  )
    throw new HttpError(429, "Demasiados intentos. Espera un momento.");
}
export function setCookie(res, t, seconds) {
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}
export async function login(req, res, password) {
  sameOrigin(req);
  const ip = process.env.VERCEL
    ? req.headers["x-vercel-forwarded-for"] || req.socket?.remoteAddress
    : req.socket?.remoteAddress;
  await limit(`login:${hash(String(ip || "unknown"))}`, 5, 900);
  await limit("login:global", 50, 900);
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
    throw new HttpError(
      503,
      "Falta configurar una clave de administrador segura.",
    );
  if (!matches(password, process.env.ADMIN_PASSWORD))
    throw new HttpError(401, "Clave incorrecta.");
  const t = randomBytes(32).toString("hex");
  const age = 7 * 86400;
  await db(
    `admin_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
    { method: "DELETE" },
  );
  await db("admin_sessions", {
    method: "POST",
    body: {
      token_hash: hash(t),
      expires_at: new Date(Date.now() + age * 1000).toISOString(),
    },
  });
  setCookie(res, t, age);
}
export async function logout(req, res) {
  sameOrigin(req);
  const t = token(req);
  if (t)
    await db(`admin_sessions?token_hash=eq.${hash(t)}`, { method: "DELETE" });
  setCookie(res, "", 0);
}
