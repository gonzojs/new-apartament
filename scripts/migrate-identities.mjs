// Backfill only externally confirmed identities. Never merge or delete rows.
import { db } from "../lib/db.js";
import { getProduct, storeFor } from "../lib/stores.js";
import { identityFor } from "../lib/imports.js";
const items = await db("products?order=created_at.asc&limit=1000");
let updated = 0,
  unconfirmed = 0,
  conflicts = 0;
for (const row of items) {
  if (row.store_id && row.product_id) continue;
  if (!storeFor(row.url)) {
    unconfirmed++;
    continue;
  }
  try {
    const p = await getProduct(row.url, row);
    if (!p.product_id || p.product_id === "undefined") {
      unconfirmed++;
      continue;
    }
    const key = identityFor(p);
    const duplicate = await db(
      `products?identity_key=eq.${encodeURIComponent(key)}&id=neq.${row.id}&limit=1`,
    );
    if (duplicate.length) {
      conflicts++;
      continue;
    }
    await db(
      `products?id=eq.${row.id}&identity_key=eq.${encodeURIComponent(row.identity_key)}`,
      {
        method: "PATCH",
        body: {
          identity_key: key,
          store_id: p.store_id,
          product_id: p.product_id,
          variant_id: p.variant_id || null,
        },
      },
    );
    updated++;
  } catch {
    unconfirmed++;
  }
}
console.log(
  JSON.stringify({ updated, unconfirmed, conflicts, total: items.length }),
);
