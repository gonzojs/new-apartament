import { db, HttpError } from "../lib/db.js";
import { endpoint, method, body, query, uuid } from "../lib/http.js";
import { admin, limit } from "../lib/auth.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST", "DELETE");
  if (req.method === "GET")
    return res.json(
      await db(
        `comments?product_id=eq.${uuid(query(req).get("product_id"))}&order=created_at.asc`,
      ),
    );
  await admin(req);
  await limit("mutations", 120, 60);
  if (req.method === "DELETE") {
    await db(`comments?id=eq.${uuid(query(req).get("id"))}`, {
      method: "DELETE",
    });
    return res.json({ ok: true });
  }
  const b = body(req);
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text || text.length > 4000)
    throw new HttpError(
      400,
      "El comentario debe tener entre 1 y 4000 caracteres.",
    );
  const r = await db("comments?on_conflict=id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: {
      id: uuid(b.id),
      product_id: uuid(b.product_id),
      text,
      author: "Yo",
    },
  });
  res.json(r[0] || { ok: true });
});
