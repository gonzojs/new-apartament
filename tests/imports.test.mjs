import test from "node:test";
import assert from "node:assert/strict";
process.env.LOCAL_DATABASE_PATH = "memory://";
const { localConnection } = await import("../scripts/local-db.mjs");
const { db, rpc } = await import("../lib/db.js");
const { remember, recalled, identityFor } = await import("../lib/imports.js");
const { productData } = await import("../lib/validation.js");
const { parseBenuta } = await import("../lib/adapters/benuta.js");
const { parseSweeek } = await import("../lib/adapters/sweeek.js");
const { structuredProduct } = await import("../lib/stores.js");
const { runStores } = await import("../web/search-queue.js");
let pg;
test.before(async () => (pg = await localConnection()));
test.after(async () => pg.close());
const sample = {
  url: "https://www.benuta.es/example.html",
  name: "Alfombra",
  img: "https://dam.benuta.com/example.jpg",
  store: "Benuta",
  store_id: "benuta",
  product_id: "p1",
  variant_id: "size1",
  variant: "160 × 230",
  currency: "EUR",
  price_cents: 9900,
  price_kind: "exact",
  price_source: "constructor",
  observed_at: "2026-01-01T10:00:00.000Z",
  availability: "unknown",
};
const save = (d) =>
  rpc("save_product", { p_data: d, p_id: null, p_version: null });
test("server import references retain observed prices and timestamp; no store call is needed", async () => {
  const [candidate] = await remember([sample]);
  const trusted = await recalled(candidate.import_ref, sample.url);
  const saved = await save(
    productData({ ...sample, price_cents: 1 }, undefined, trusted),
  );
  assert.equal(saved.price_cents, 9900);
  assert.equal(new Date(saved.checked_at).toISOString(), sample.observed_at);
  const history = await db(`price_history?product_id=eq.${saved.id}`);
  assert.equal(history.length, 1);
  assert.equal(
    new Date(history[0].observed_at).toISOString(),
    sample.observed_at,
  );
  const again = await save(productData(sample, undefined, trusted));
  assert.equal(again.id, saved.id);
  assert.equal((await db(`price_history?product_id=eq.${saved.id}`)).length, 1);
});
test("distinct sizes may share URL; altered/expired references cannot supply a price", async () => {
  const [a, b] = await remember([
    { ...sample, product_id: "p2" },
    { ...sample, product_id: "p2", variant_id: "size2" },
  ]);
  const first = await save(productData(sample, undefined, a)),
    second = await save(productData(sample, undefined, b));
  assert.notEqual(first.id, second.id);
  await assert.rejects(
    recalled(a.import_ref, "https://example.com/other"),
    (e) => e.status === 400,
  );
  await pg.query(
    "update import_candidates set expires_at=now()-interval '1 second' where id=$1",
    [a.import_ref],
  );
  await assert.rejects(
    recalled(a.import_ref, sample.url),
    (e) => e.status === 410,
  );
  const untrusted = productData({
    ...sample,
    price_cents: 1,
    product_id: "fake",
    identity_key: "fake",
  });
  assert.equal(untrusted.price_cents, null);
  assert.equal(untrusted.product_id, null);
  assert.equal(untrusted.identity_key, identityFor({ url: sample.url }));
});
test("partial HTML keeps title and image without price; image corrections persist", async () => {
  const p = structuredProduct(
    '<meta property="og:title" content="Lámpara"><meta property="og:image" content="https://example.com/lamp.jpg">',
    "https://example.com/lamp",
  );
  assert.equal(p.name, "Lámpara");
  assert.equal(p.price_cents, null);
  assert.ok(p.img);
  const a = await save(productData({ url: "https://example.com/lamp", ...p }));
  const updated = await rpc("save_product", {
    p_id: a.id,
    p_version: a.version,
    p_data: productData({ img: "https://example.com/corrected.jpg" }, a),
  });
  assert.equal(updated.img, "https://example.com/corrected.jpg");
  const refreshed = await rpc("capture_price", {
    p_id: updated.id,
    p_version: updated.version,
    p_data: {
      price_cents: 1000,
      price_kind: "exact",
      price_source: "store",
      availability: "in_stock",
      img: "https://example.com/from-store.jpg",
    },
    p_key: "image-test",
  });
  assert.equal(refreshed.img, "https://example.com/corrected.jpg");
});
test("Benuta selects size price, never parent price or parent stock for a variant", () => {
  const data = {
    response: {
      results: [
        {
          value: "Alfombra",
          data: {
            id: "rug",
            parent_name: "Alfombra",
            url: "rug",
            parent_price: 49,
            parent_in_stock: true,
            currency_code: "EUR",
          },
          variations: [
            { data: { variation_id: "large", size: "200 cm", price: 229 } },
            { data: { variation_id: "small", size: "90 cm", price: 49 } },
          ],
        },
      ],
    },
  };
  const p = parseBenuta(data);
  assert.equal(p[0].price_cents, 22900);
  assert.equal(p[1].price_cents, 4900);
  assert.equal(p[0].availability, "unknown");
  assert.equal(p[0].price_kind, "exact");
  assert.notEqual(identityFor(p[0]), identityFor(p[1]));
});
test("Sweeek keeps each article image, color and EUR price", () => {
  const items = parseSweeek({
    products: [
      {
        title: "Mesa",
        link: "https://www.sweeek.es/product/table",
        currency_code: "EUR",
        article_id: "a",
        price: 89.99,
        availability: "in stock",
        variants: [
          { article_id: "a", color: "Natural" },
          {
            article_id: "b",
            color: "Oscura",
            price: 119.99,
            link: "https://www.sweeek.es/product/dark",
          },
        ],
      },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].price_cents, 8999);
  assert.equal(items[1].price_cents, 11999);
  assert.equal(items[1].variant, "Oscura");
});
test("search queue caps concurrency and does not start work after cancellation", async () => {
  let active = 0,
    max = 0,
    started = 0;
  const c = new AbortController();
  await runStores(
    [1, 2, 3, 4, 5, 6],
    async () => {
      started++;
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      c.abort();
      active--;
    },
    c.signal,
  );
  assert.equal(max, 3);
  assert.equal(started, 3);
});
test("schema migration is repeatable and preserves UUIDs, comments and observations", async () => {
  const before = await db("products");
  const { readFile } = await import("node:fs/promises");
  await pg.exec(await readFile("supabase/schema.sql", "utf8"));
  assert.deepEqual(
    (await db("products")).map((p) => p.id).sort(),
    before.map((p) => p.id).sort(),
  );
});
test("ProductGroup resolves its own offer rather than a cheaper sibling variant", () => {
  const page = {
    "@type": "ProductGroup",
    "@id": "https://example.com/dark",
    name: "Mesa oscura",
    sku: "dark",
    offers: {
      url: "https://example.com/dark",
      price: "119.99",
      priceCurrency: "EUR",
    },
    hasVariant: [
      {
        "@type": "Product",
        name: "Natural",
        offers: {
          url: "https://example.com/natural",
          price: 89.99,
          priceCurrency: "EUR",
        },
      },
    ],
  };
  const html = `<script type="application/ld+json">${JSON.stringify(page)}</script>`;
  assert.equal(
    structuredProduct(html, "https://example.com/dark").price_cents,
    11999,
  );
  assert.equal(
    structuredProduct(html, "https://example.com/natural").price_cents,
    8999,
  );
});

test("incomplete variants never inherit the selected sibling price or stock", () => {
  const benuta = parseBenuta({
    response: {
      results: [
        {
          value: "Alfombra",
          data: {
            id: "p",
            variation_id: "a",
            size: "100",
            price: 100,
            currency_code: "EUR",
            url: "rug",
          },
          variations: [{ data: { variation_id: "b", size: "200" } }],
        },
      ],
    },
  });
  assert.equal(benuta[0].price_cents, null);
  const sweeek = parseSweeek({
    products: [
      {
        article_id: "a",
        title: "Mesa",
        price: 100,
        currency_code: "EUR",
        availability: "in stock",
        image_link: "https://example.com/a.jpg",
        link: "https://www.sweeek.es/product/a",
        variants: [
          {
            article_id: "b",
            color: "Otra",
            link: "https://www.sweeek.es/product/b",
          },
        ],
      },
    ],
  });
  assert.equal(sweeek[0].price_cents, null);
  assert.equal(sweeek[0].availability, "unknown");
  assert.equal(sweeek[0].img, null);
});
