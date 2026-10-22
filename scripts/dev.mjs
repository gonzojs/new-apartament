import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
if (process.env.LOCAL_DATABASE_PATH) await import("./local-db.mjs");
const port = Number(process.env.PORT || 3000),
  root = resolve(".");
const routes = new Set([
  "products",
  "session",
  "comments",
  "history",
  "search",
  "preview",
  "refresh",
  "cron",
  "stores",
]);
const modules = Object.fromEntries(
  await Promise.all(
    [...routes].map(async (r) => [r, (await import(`../api/${r}.js`)).default]),
  ),
);
const server = http.createServer(async (req, res) => {
  res.status = (n) => {
    res.statusCode = n;
    return res;
  };
  res.json = (d) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(d));
  };
  try {
    const url = new URL(req.url, "http://local");
    if (url.pathname.startsWith("/api/")) {
      const route = url.pathname.slice(5);
      if (!routes.has(route)) {
        res.statusCode = 404;
        return res.end();
      }
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 20000) {
          res.statusCode = 413;
          return res.end();
        }
      }
      if (raw)
        try {
          req.body = JSON.parse(raw);
        } catch {
          res.statusCode = 400;
          return res.json({ error: "JSON inválido." });
        }
      return await modules[route](req, res);
    }
    const relative =
      url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (relative !== "index.html" && !relative.startsWith("web/")) {
      res.statusCode = 404;
      return res.end();
    }
    const path = resolve(root, relative);
    if (!path.startsWith(root + "/")) {
      res.statusCode = 403;
      return res.end();
    }
    const content = await readFile(path);
    res.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(path)
      ] || "text/plain",
    );
    res.end(content);
  } catch {
    res.statusCode = 500;
    res.end("Error local");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Apartamento: http://127.0.0.1:${port} (${process.env.LOCAL_DATABASE_PATH ? "PostgreSQL local aislado" : "Supabase"})`,
  ),
);
