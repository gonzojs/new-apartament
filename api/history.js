import { db } from "../lib/db.js";
import { endpoint, method, query, uuid } from "../lib/http.js";
export default endpoint(async (req, res) => {
  method(req, "GET");
  res.json(
    await db(
      `price_history?product_id=eq.${uuid(query(req).get("product_id"))}&order=observed_at.desc&limit=365`,
    ),
  );
});
