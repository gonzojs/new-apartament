import { db, rpc, product } from "../lib/db.js";
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
  const data = productData(b, previous);
  const saved = await rpc("save_product", {
    p_data: data,
    p_id: previous?.id || null,
    p_version: previous ? b.version : null,
  });
  res.json(saved);
});
