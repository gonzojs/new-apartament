// Run with server-only environment, after the schema migration. Counts and identifiers only.
import { db } from "../lib/db.js";
import { readFile } from "node:fs/promises";
const before = JSON.parse(await readFile(process.argv[2], "utf8"));
for (const table of ["products", "comments", "price_history"]) {
  const rows = await db(`${table}?limit=1000`);
  const ids = new Set(rows.map((p) => p.id));
  const missing = before[table].filter((p) => !ids.has(p.id));
  if (missing.length)
    throw new Error(`${table}: ${missing.length} IDs missing`);
  console.log(
    JSON.stringify({
      table,
      before: before[table].length,
      after: rows.length,
      missing: 0,
    }),
  );
}
