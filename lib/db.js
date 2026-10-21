export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
let developmentDatabase;
export function setDevelopmentDatabase(adapter) {
  if (process.env.VERCEL)
    throw new Error("Development database is disabled on Vercel");
  developmentDatabase = adapter;
}
export async function db(
  path,
  { method = "GET", body, prefer = "return=representation" } = {},
) {
  if (developmentDatabase && !process.env.VERCEL) {
    try {
      return await developmentDatabase(path, { method, body, prefer });
    } catch (e) {
      if (e.message.includes("VERSION_CONFLICT"))
        throw new HttpError(
          409,
          "Este producto cambió en otro dispositivo. Recarga antes de editar.",
        );
      if (e.message.includes("NOT_FOUND"))
        throw new HttpError(404, "Producto no encontrado.");
      throw e;
    }
  }
  const base = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key)
    throw new HttpError(503, "La base de datos aún no está configurada.");
  const started = Date.now();
  const r = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  console.info(
    JSON.stringify({
      event: "database",
      resource: path.split("?")[0],
      method,
      status: r.status,
      ms: Date.now() - started,
    }),
  );
  if (!r.ok) {
    if (text.includes("VERSION_CONFLICT"))
      throw new HttpError(
        409,
        "Este producto cambió en otro dispositivo. Recarga antes de editar.",
      );
    if (text.includes("NOT_FOUND"))
      throw new HttpError(404, "Producto no encontrado.");
    if (r.status === 409) throw new HttpError(409, "Ese producto ya existe.");
    throw new HttpError(
      503,
      "No se pudo guardar o consultar la base de datos. Inténtalo de nuevo.",
    );
  }
  return text ? JSON.parse(text) : null;
}
export const rpc = (name, body) => db(`rpc/${name}`, { method: "POST", body });
export async function product(id) {
  const rows = await db(`products?id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows[0]) throw new HttpError(404, "Producto no encontrado.");
  return rows[0];
}
