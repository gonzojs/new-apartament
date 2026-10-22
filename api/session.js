import { endpoint, method, body } from "../lib/http.js";
import { session, login, logout } from "../lib/auth.js";
export default endpoint(async (req, res) => {
  method(req, "GET", "POST", "DELETE");
  if (req.method === "GET") return res.json({ admin: await session(req, res) });
  if (req.method === "DELETE") {
    await logout(req, res);
    return res.json({ admin: false });
  }
  await login(req, res, String(body(req).password || ""));
  res.json({ admin: true });
});
