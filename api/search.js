import { db, HttpError } from "../lib/db.js";
import { endpoint, method, body } from "../lib/http.js";
import { admin, limit, hash } from "../lib/auth.js";
import { STORES, searchStore } from "../lib/stores.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST");
  if (req.method === "GET")
    return res.json(
      STORES.map(({ id, name, search, external }) => ({
        id,
        name,
        search,
        external,
      })),
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
  const key = hash(`${s.id}:${q.toLowerCase()}:ES:EUR`);
  const cached = await db(
    `search_cache?key=eq.${key}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
  );
  if (cached[0]) return res.json({ ...cached[0].value, cached: true });
  try {
    const result = await searchStore(s.id, q);
    await db(
      `search_cache?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
      { method: "DELETE" },
    );
    await db("search_cache?on_conflict=key", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        key,
        value: result,
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      },
    });
    res.json(result);
  } catch {
    throw new HttpError(
      502,
      `${s.name} no respondió. Puedes abrir la búsqueda en su web.`,
    );
  }
});
