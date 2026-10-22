import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
process.env.LOCAL_DATABASE_PATH = "memory://";
process.env.ADMIN_PASSWORD = "api-test-password-not-production";
process.env.CRON_SECRET = "cron-test";
const { remember } = await import("../lib/imports.js");
const { localConnection } = await import("../scripts/local-db.mjs");
const routeNames = [
  "products",
  "session",
  "search",
  "preview",
  "refresh",
  "comments",
  "history",
  "cron",
  "stores",
];
const handlers = Object.fromEntries(
  await Promise.all(
    routeNames.map(async (name) => [
      name,
      (await import(`../api/${name}.js`)).default,
    ]),
  ),
);
let server, base, cookie, pg;
test.before(async () => {
  pg = await localConnection();
  server = http.createServer(async (req, res) => {
    res.status = (n) => {
      res.statusCode = n;
      return res;
    };
    res.json = (data) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };
    let text = "";
    for await (const c of req) text += c;
    if (text) req.body = JSON.parse(text);
    await handlers[new URL(req.url, "http://local").pathname.slice(1)](
      req,
      res,
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  await pg.close();
});
async function call(path, method = "GET", body, auth = false, origin = base) {
  return fetch(base + "/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(auth ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test("all external and mutation routes require auth; reads are public", async () => {
  for (const route of ["products", "search", "preview", "refresh", "comments"])
    assert.equal((await call(route, "POST", {})).status, 401, route);
  assert.equal((await call("products")).status, 200);
  assert.equal((await call("cron")).status, 401);
  assert.equal((await call("stores")).status, 401);
  assert.equal((await call("stores", "POST", {})).status, 401);
});
test("full persisted API lifecycle with conflict, idempotency and logout", async () => {
  const login = await call("session", "POST", {
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  let r = await call(
    "products",
    "POST",
    {
      name: "Mesa API",
      url: "https://example.com/test-api",
      manual_price_cents: 12000,
    },
    true,
  );
  assert.equal(r.status, 200);
  let p = await r.json();
  const again = await (
    await call(
      "products",
      "POST",
      { name: "Mesa API", url: "https://example.com/test-api" },
      true,
    )
  ).json();
  assert.equal(again.id, p.id);
  const [candidate] = await remember([
    {
      url: "https://example.com/import-route",
      name: "Importado",
      store_id: "test",
      product_id: "p1",
      variant_id: "v1",
      price_cents: 9999,
      price_kind: "exact",
      price_source: "test-api",
      currency: "EUR",
      observed_at: "2026-01-01T00:00:00.000Z",
    },
  ]);
  const imported = await (
    await call(
      "products",
      "POST",
      {
        url: candidate.url,
        name: candidate.name,
        import_ref: candidate.import_ref,
        price_cents: 1,
      },
      true,
    )
  ).json();
  assert.equal(imported.price_cents, 9999);
  const plainRetry = await (
    await call(
      "products",
      "POST",
      { url: candidate.url, name: "Sin referencia" },
      true,
    )
  ).json();
  assert.equal(plainRetry.id, imported.id);
  assert.equal(
    (
      await call(
        "products",
        "POST",
        {
          url: candidate.url,
          name: "Manipulado",
          import_ref: "00000000-0000-4000-a000-000000000000",
        },
        true,
      )
    ).status,
    410,
  );
  await call(`products?id=${imported.id}`, "DELETE", undefined, true);
  const [a, b] = await Promise.all([
    call(
      "products",
      "PATCH",
      { id: p.id, version: p.version, room: "Salón" },
      true,
    ),
    call(
      "products",
      "PATCH",
      { id: p.id, version: p.version, room: "Cocina" },
      true,
    ),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const history = await (await call(`history?product_id=${p.id}`)).json();
  assert.equal(history.length, 1);
  assert.equal(history[0].price_cents, 12000);
  assert.equal(
    (await call("products", "PATCH", { id: p.id, name: "sin version" }, true))
      .status,
    409,
  );
  assert.equal(
    (
      await call(
        "products",
        "POST",
        { name: "Attack", url: "http://127.0.0.1/private" },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "products",
        "POST",
        { name: "Attack", url: "https://example.com" },
        true,
        "https://evil.test",
      )
    ).status,
    403,
  );
  const id = crypto.randomUUID();
  const comment = { id, product_id: p.id, text: "persistente" };
  await call("comments", "POST", comment, true);
  await call("comments", "POST", comment, true);
  assert.equal(
    (await (await call(`comments?product_id=${p.id}`)).json()).length,
    1,
  );
  assert.equal(
    (await call(`products?id=${p.id}`, "DELETE", undefined, true)).status,
    200,
  );
  assert.equal(
    (await (await call(`comments?product_id=${p.id}`)).json()).length,
    0,
  );
  assert.equal((await call("session", "DELETE", undefined, true)).status, 200);
  assert.equal((await call("products", "POST", {}, true)).status, 401);
});
test("invalid passwords are rate limited persistently", async () => {
  const results = [];
  for (let i = 0; i < 6; i++)
    results.push((await call("session", "POST", { password: "wrong" })).status);
  assert.equal(results.at(-1), 429);
  assert.ok(results.includes(401));
});
