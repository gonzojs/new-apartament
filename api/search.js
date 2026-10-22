import { remember } from "../lib/imports.js";
import { measured } from "../lib/store-health.js";
import { db, HttpError } from "../lib/db.js";
import { endpoint, method, body } from "../lib/http.js";
import { admin, limit, hash } from "../lib/auth.js";
import { STORES, searchStore } from "../lib/stores.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST");
  if (req.method === "GET")
    return res.json(
      STORES.map(
        ({ id, name, search, external, import_link, method, reason }) => ({
          id,
          name,
          search,
          external,
          import_link,
          method,
          reason,
        }),
      ),
    );
  await admin(req);
  await limit("search", 140, 60);
  const b = body(req);
  const q = typeof b.query === "string" ? b.query.trim() : "";
  const s = STORES.find((s) => s.id === b.store);
  if (!s || q.length < 2 || q.length > 120)
    throw new HttpError(400, "Búsqueda inválida.");
  if (!s.search)
    return res.json({
      items: [],
      unsupported: true,
      external: s.external + encodeURIComponent(q),
    });
  const key = hash(`v3:${s.id}:${q.toLowerCase()}:ES:EUR`);
  const cached = await db(
    `search_cache?key=eq.${key}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
  );
  if (cached[0]) return res.json({ ...cached[0].value, cached: true });
  let result;
  try {
    result = await measured(s.id, "search", () => searchStore(s.id, q));
  } catch (error) {
    throw new HttpError(
      502,
      `${s.name}: ${error.message}. Puedes abrir su búsqueda externa.`,
    );
  }
  result = { ...result, items: await remember(result.items) };
  // Cache failures must not hide valid store results.
  await db("search_cache?on_conflict=key", {
    method: "POST",
    prefer: "resolution=merge-duplicates",
    body: {
      key,
      value: result,
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
    },
  }).catch(() =>
    console.warn(
      JSON.stringify({ event: "search_cache_write_failed", store: s.id }),
    ),
  );
  res.json(result);
});
