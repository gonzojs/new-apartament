import { endpoint, method, body } from "../lib/http.js";
import { db, HttpError } from "../lib/db.js";
import { admin, session, limit } from "../lib/auth.js";
import { STORES, searchStore, getProduct } from "../lib/stores.js";
import { measured } from "../lib/store-health.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST");
  if (req.method === "POST") {
    await admin(req);
    await limit("store-tests", 12, 60);
    const b = body(req),
      s = STORES.find((s) => s.id === b.store);
    if (!s) throw new HttpError(400, "Tienda desconocida.");
    if (s.search) {
      const r = await measured(s.id, "search", () =>
        searchStore(s.id, s.id === "benuta" ? "alfombra" : "mesa"),
      );
      if (r.items[0])
        await measured(s.id, "preview", () =>
          getProduct(r.items[0].url, r.items[0]),
        );
    } else {
      const saved = await db(
        `products?store=eq.${encodeURIComponent(s.name)}&limit=1`,
      );
      if (!saved[0])
        throw new HttpError(
          422,
          "Pega un enlace de producto para probar la importación. La búsqueda automática no está disponible.",
        );
      await measured(s.id, "preview", () => getProduct(saved[0].url, saved[0]));
    }
  } else if (!(await session(req)))
    throw new HttpError(401, "Introduce la clave de administrador.");
  const health = await db("store_health");
  res.json(
    STORES.map((s) => ({
      ...s,
      health: health.filter((h) => h.value.store === s.id).map((h) => h.value),
    })),
  );
});
