import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.env.LOCAL_DATABASE_PATH = "memory://";
process.env.ADMIN_PASSWORD = "a-long-test-password-only";
const { localConnection } = await import("../scripts/local-db.mjs");
const { db, rpc } = await import("../lib/db.js");
const { productData } = await import("../lib/validation.js");
const { canonicalUrl, publicIP, fetchPublic } = await import("../lib/net.js");
const { structuredProduct, empathyResult, STORES } = await import(
  "../lib/stores.js"
);
const { login, logout, session, admin, matches, hash } = await import(
  "../lib/auth.js"
);
let pg;
test.before(async () => {
  pg = await localConnection();
});
test.after(async () => {
  await pg.close();
});
const data = (overrides = {}) =>
  productData({
    url: `https://example.com/${randomUUID()}`,
    name: "Mesa",
    ...overrides,
  });
const save = (d) =>
  rpc("save_product", { p_data: d, p_id: null, p_version: null });
test("canonical URLs preserve variants and remove tracking; private destinations rejected", async () => {
  assert.equal(
    canonicalUrl(
      "http://northdeco.com/products/x?utm_source=x&variant=123#test",
    ),
    "https://northdeco.com/products/x?variant=123",
  );
  for (const u of [
    "file:///etc/passwd",
    "https://127.0.0.1/",
    "https://user:pass@example.com/",
    "https://example.com:123/",
    "https://foo.local/",
  ])
    assert.throws(() => canonicalUrl(u));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.0.1",
    "100.64.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicIP(ip), false, ip);
  assert.equal(publicIP("8.8.8.8"), true);
  await assert.rejects(fetchPublic("https://evil.example/", ["northdeco.com"]));
});
test("product creation is idempotent and variants remain separate", async () => {
  const d = data();
  const a = await save(d),
    b = await save(d);
  assert.equal(a.id, b.id);
  assert.equal(a.price_cents, null);
  const v = await save(data({ url: d.url + "?variant=2" }));
  assert.notEqual(v.id, a.id);
});
test("manual prices including zero have history; concurrent/stale writes cannot clobber", async () => {
  const a = await save(data({ manual_price_cents: 0 }));
  assert.equal(a.price_cents, 0);
  assert.equal((await db(`price_history?product_id=eq.${a.id}`)).length, 1);
  const patch = productData({ name: "Mesa editada", favorite: true }, a);
  const b = await rpc("save_product", {
    p_data: patch,
    p_id: a.id,
    p_version: a.version,
  });
  assert.equal(b.favorite, true);
  assert.equal(b.version, 2);
  await assert.rejects(
    rpc("save_product", { p_data: patch, p_id: a.id, p_version: a.version }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    rpc("save_product", { p_data: patch, p_id: a.id, p_version: null }),
    (e) => e.status === 409,
  );
  assert.equal((await db(`products?id=eq.${a.id}`))[0].name, "Mesa editada");
});
test("daily history deduplicates, failed checks preserve prices, stale refresh cannot overwrite edits", async () => {
  let p = await save(data());
  const observation = {
    price_cents: 19999,
    price_kind: "exact",
    price_source: "shopify",
    availability: "in_stock",
  };
  p = await rpc("capture_price", {
    p_id: p.id,
    p_version: p.version,
    p_data: observation,
    p_key: "daily:2026-10-20",
  });
  p = await rpc("capture_price", {
    p_id: p.id,
    p_version: p.version,
    p_data: observation,
    p_key: "daily:2026-10-20",
  });
  assert.equal((await db(`price_history?product_id=eq.${p.id}`)).length, 1);
  const fail = await rpc("capture_price", {
    p_id: p.id,
    p_version: p.version,
    p_data: { error: "Timeout" },
    p_key: "fail",
  });
  assert.equal(fail.price_cents, 19999);
  assert.equal(fail.refresh_error, "Timeout");
  const changed = await rpc("save_product", {
    p_id: p.id,
    p_version: p.version,
    p_data: productData({ manual_price_cents: 12000 }, p),
  });
  const stale = await rpc("capture_price", {
    p_id: p.id,
    p_version: p.version,
    p_data: observation,
    p_key: "stale",
  });
  assert.equal(stale.price_cents, changed.price_cents);
});
test("purchase total snapshots do not change with later prices", async () => {
  let p = await save(data({ manual_price_cents: 10000 }));
  p = await rpc("save_product", {
    p_id: p.id,
    p_version: p.version,
    p_data: productData({ status: "purchased", quantity: 2 }, p),
  });
  assert.equal(p.purchased_cents, 10000);
  p = await rpc("capture_price", {
    p_id: p.id,
    p_version: p.version,
    p_data: {
      price_cents: 20000,
      price_kind: "exact",
      price_source: "shopify",
      availability: "in_stock",
    },
    p_key: "later",
  });
  assert.equal(p.purchased_cents, 10000);
});
test("deleting another product cannot change favorites; comments cascade", async () => {
  const a = await save(data({ favorite: true })),
    b = await save(data());
  const c = { id: randomUUID(), product_id: b.id, text: "Una nota" };
  await db("comments", { method: "POST", body: c });
  await db(`products?id=eq.${b.id}`, { method: "DELETE" });
  assert.equal((await db(`products?id=eq.${a.id}`))[0].favorite, true);
  assert.equal((await db(`comments?id=eq.${c.id}`)).length, 0);
});
test("leases and rate limits work across concurrent calls", async () => {
  const rates = await Promise.all(
    Array.from({ length: 7 }, () =>
      rpc("take_rate", { p_key: "test-rate", p_limit: 5, p_seconds: 60 }),
    ),
  );
  assert.equal(rates.filter(Boolean).length, 5);
  const leases = await Promise.all(
    Array.from({ length: 3 }, () =>
      rpc("acquire_lease", { p_key: "test-lease", p_seconds: 60 }),
    ),
  );
  assert.equal(leases.filter(Boolean).length, 1);
});
test("admin login sets HttpOnly cookie, blocks cross-origin requests, expires and revokes", async () => {
  const req = {
    headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  let cookie;
  const res = { setHeader: (k, v) => (cookie = v) };
  await login(req, res, process.env.ADMIN_PASSWORD);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  req.headers.cookie = cookie.split(";")[0];
  assert.equal(await session(req), true);
  const tokenHash = hash(req.headers.cookie.split("=")[1]);
  await db(`admin_sessions?token_hash=eq.${tokenHash}`, {
    method: "PATCH",
    body: { expires_at: new Date(Date.now() + 60000).toISOString() },
  });
  assert.equal(await session(req, res), true);
  assert.match(cookie, /Max-Age=31536000/);
  const renewed = (await db(`admin_sessions?token_hash=eq.${tokenHash}`))[0];
  assert.ok(
    new Date(renewed.expires_at).getTime() > Date.now() + 364 * 86400000,
  );
  await admin(req);
  await assert.rejects(
    admin({ ...req, headers: { ...req.headers, origin: "https://evil.com" } }),
    (e) => e.status === 403,
  );
  await logout(req, res);
  assert.equal(await session(req), false);
  await assert.rejects(admin(req), (e) => e.status === 401);
  assert.equal(matches("x", "x"), true);
  assert.equal(matches("x", "y"), false);
});
test("structured data does not assign another variant or currency price", () => {
  const html = JSON.stringify({
    "@type": "Product",
    name: "Mesa",
    offers: { "@type": "Offer", price: "49.99", priceCurrency: "EUR" },
  });
  const parse = (url) =>
    structuredProduct(
      `<script type="application/ld+json">${html}</script>`,
      url,
    );
  assert.equal(parse("https://example.com/p").price_cents, 4999);
  assert.equal(parse("https://example.com/p?variant=2").price_cents, null);
  assert.equal(
    structuredProduct(
      `<script type="application/ld+json">${html.replace("EUR", "USD")}</script>`,
      "https://example.com/p",
    ).price_cents,
    null,
  );
});
test("Empathy selects the public consumer price and selected color", () => {
  const p = empathyResult(
    STORES.find((s) => s.id === "sklum"),
    {
      shopTitle: "Mesa azul",
      shopUrl: "https://www.sklum.com/es/1-mesa.html?id_c=2",
      renderData: JSON.stringify({
        sC: 2,
        a: [{ id: 8, name: "Azul" }],
        c: [
          { id: 1, p: { 3: 80 } },
          { id: 2, a: 8, p: { 3: 99.95, 629: 50 }, s: { iS: true } },
        ],
      }),
    },
  );
  assert.equal(p.price_cents, 9995);
  assert.equal(p.variant, "Azul");
});
test("anonymous database roles have no privileges and RLS is enabled", async () => {
  const r = await pg.query(
    "select relname,relrowsecurity from pg_class where relname in ('products','comments','price_history')",
  );
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((x) => x.relrowsecurity));
  const fn = await pg.query(
    "select count(*) as n from pg_proc, lateral aclexplode(proacl) a where proname='save_product' and a.grantee=0",
  );
  assert.equal(fn.rows[0].n, 0);
});
