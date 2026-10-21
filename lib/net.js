import https from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { HttpError } from "./db.js";
export function publicIP(ip) {
  if (isIP(ip) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith("2001:db8:")
    );
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
export function canonicalUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new HttpError(400, "Introduce un enlace válido.");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.port ||
    isIP(u.hostname) ||
    !u.hostname.includes(".") ||
    u.hostname.endsWith(".local") ||
    u.hostname.endsWith(".internal") ||
    u.hostname.length > 253 ||
    u.href.length > 2048
  )
    throw new HttpError(
      400,
      "El enlace debe ser una página pública HTTP o HTTPS.",
    );
  u.protocol = "https:";
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()])
    if (/^utm_|^_|^(gclid|fbclid|srsltid)$/i.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return u.href;
}
export function safeImage(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !isIP(u.hostname) &&
      u.hostname.includes(".")
      ? u.href.replace(/^http:/, "https:")
      : null;
  } catch {
    return null;
  }
}
export async function fetchPublic(
  value,
  hosts,
  { timeout = 8000, maxBytes = 3_000_000 } = {},
) {
  const deadline = Date.now() + timeout;
  async function visit(value, depth = 0) {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !hosts.includes(u.hostname) ||
      depth > 3
    )
      throw new Error("Destino no permitido");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Tiempo de espera agotado");
    return new Promise((resolve, reject) => {
      const request = https.get(
        u,
        {
          headers: {
            "User-Agent": "MiNuevoApartamento/1.0 (personal product tracker)",
            Accept: "application/json,text/html",
            "Accept-Language": "es-ES,es;q=0.9",
            "Accept-Encoding": "identity",
          },
          lookup: (host, opts, cb) =>
            lookup(host, { all: true }, (err, addresses) => {
              if (err) return cb(err);
              if (
                !addresses.length ||
                addresses.some((a) => !publicIP(a.address))
              )
                return cb(new Error("Dirección no pública"));
              cb(
                null,
                opts.all ? addresses : addresses[0].address,
                addresses[0].family,
              );
            }),
        },
        (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            response.resume();
            clearTimeout(timer);
            if (!response.headers.location)
              return reject(new Error("Redirección inválida"));
            visit(new URL(response.headers.location, u).href, depth + 1).then(
              resolve,
              reject,
            );
            return;
          }
          if (response.statusCode !== 200) {
            response.resume();
            clearTimeout(timer);
            return reject(new Error(`Tienda respondió ${response.statusCode}`));
          }
          let size = 0;
          const chunks = [];
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes)
              request.destroy(new Error("Respuesta demasiado grande"));
            else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString("utf8"));
          });
        },
      );
      const timer = setTimeout(
        () => request.destroy(new Error("Tiempo de espera agotado")),
        remaining,
      );
      request.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
  return visit(value);
}
