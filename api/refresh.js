import { randomUUID } from "node:crypto";
import { endpoint, method, body, uuid } from "../lib/http.js";
import { admin, limit } from "../lib/auth.js";
import { refresh } from "../lib/refresh.js";
export default endpoint(async (req, res) => {
  method(req, "POST");
  await admin(req);
  await limit("refresh", 20, 60);
  res.json(await refresh(uuid(body(req).id), `manual:${randomUUID()}`));
});
