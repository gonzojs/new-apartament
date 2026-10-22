import { recalled } from "../lib/imports.js";
import { db, rpc, product, HttpError } from "../lib/db.js";
import { endpoint, method, body, query, uuid } from "../lib/http.js";
import { admin, limit } from "../lib/auth.js";
import { productData } from "../lib/validation.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST", "PATCH", "DELETE");
  if (req.method === "GET")
    return res.json(await db("products?order=created_at.desc&limit=1000"));
  await admin(req);
  await limit("mutations", 120, 60);
  if (req.method === "DELETE") {
    await db(`products?id=eq.${uuid(query(req).get("id"))}`, {
      method: "DELETE",
    });
    return res.json({ ok: true });
  }
  const b = body(req);
  const previous =
    req.method === "PATCH" ? await product(uuid(b.id)) : undefined;
  const observation =
    !previous && b.import_ref ? await recalled(b.import_ref, b.url) : undefined;
  const data = productData(b, previous, observation);
  if (!previous && !observation) {
    const sameUrl = await db(
      `products?url=eq.${encodeURIComponent(data.url)}&limit=2`,
    );
    if (sameUrl.length === 1) return res.json(sameUrl[0]);
    if (sameUrl.length > 1)
      throw new HttpError(
        409,
        "Ya hay variantes de este enlace. Elige una desde la consulta de la tienda o edita el producto guardado.",
      );
  }
  const saved = await rpc("save_product", {
    p_data: data,
    p_id: previous?.id || null,
    p_version: previous ? b.version : null,
  });
  res.json(saved);
});
