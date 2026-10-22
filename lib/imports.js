import { randomUUID, createHash } from "node:crypto";
import { db, HttpError } from "./db.js";
import { canonicalUrl } from "./net.js";
export function identityFor(p) {
  return p.store_id && p.product_id
    ? ["store", p.store_id, p.product_id, p.variant_id || "unspecified"]
        .map(encodeURIComponent)
        .join(":")
    : "url:" + createHash("md5").update(canonicalUrl(p.url)).digest("hex");
}
export async function remember(items) {
  if (!items.length) return [];
  const expires_at = new Date(Date.now() + 24 * 3600000).toISOString();
  const rows = items.map((value) => ({
    id: randomUUID(),
    value: { ...value, identity_key: identityFor(value) },
    expires_at,
  }));
  await db("import_candidates", { method: "POST", body: rows });
  await db(
    `import_candidates?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
    { method: "DELETE" },
  );
  return rows.map((r) => ({ ...r.value, import_ref: r.id }));
}
export async function recalled(id, url) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    throw new HttpError(400, "Referencia de importación inválida.");
  const rows = await db(
    `import_candidates?id=eq.${id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
  );
  if (!rows[0])
    throw new HttpError(
      410,
      "La consulta ha caducado. Vuelve a consultar o guarda sin los datos automáticos.",
    );
  const p = rows[0].value;
  if (canonicalUrl(url) !== canonicalUrl(p.url))
    throw new HttpError(400, "El enlace cambió. Vuelve a consultar sus datos.");
  return p;
}
