// Legacy route now authenticated; it never writes or accepts arbitrary fetch destinations.
import { endpoint, method, body } from "../lib/http.js";
import { admin, limit } from "../lib/auth.js";
import { canonicalUrl } from "../lib/net.js";
import { getProduct } from "../lib/stores.js";
import { HttpError } from "../lib/db.js";
export default endpoint(async (req, res) => {
  method(req, "POST");
  await admin(req);
  await limit("preview", 20, 60);
  try {
    res.json(await getProduct(canonicalUrl(body(req).url)));
  } catch (e) {
    throw new HttpError(422, e.message);
  }
});
