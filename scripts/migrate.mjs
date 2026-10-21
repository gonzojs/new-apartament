import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { list } from "@vercel/blob";
import { db } from "../lib/db.js";
import { canonicalUrl, safeImage } from "../lib/net.js";
if (process.env.LOCAL_DATABASE_PATH) await import("./local-db.mjs");
const mode = process.argv[2],
  file = process.argv[3] || "work/backups/products.json";
function stableId(text) {
  const h = createHash("sha256").update(text).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
if (mode === "backup") {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw new Error("Falta BLOB_READ_WRITE_TOKEN");
  const { blobs } = await list({
    prefix: "products",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const candidates = blobs.filter((b) => b.pathname === "products.json");
  if (candidates.length !== 1)
    throw new Error(
      `Esperaba un products.json, encontrados ${candidates.length}. No se modifica nada.`,
    );
  const u = new URL(candidates[0].url);
  u.searchParams.set("backup", Date.now());
  const r = await fetch(u, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Blob ${r.status}`);
  const raw = await r.text();
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("Formato de backup inválido");
  await mkdir("work/backups", { recursive: true, mode: 0o700 });
  const dated = `work/backups/products-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  for (const dest of [dated, file]) {
    await writeFile(dest, raw, { mode: 0o600 });
    await chmod(dest, 0o600);
  }
  console.log(
    JSON.stringify({
      backup: dated,
      products: data.length,
      comments: data.reduce((n, p) => n + (p.comments?.length || 0), 0),
      sha256: createHash("sha256").update(raw).digest("hex"),
    }),
  );
} else if (mode === "import") {
  const legacy = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(legacy)) throw new Error("Backup inválido");
  let comments = 0;
  const seen = new Set();
  for (const [index, p] of legacy.entries()) {
    const url = canonicalUrl(p.url);
    if (seen.has(url))
      throw new Error(
        `URL duplicada en backup, fila ${index + 1}; resolver antes de migrar.`,
      );
    seen.add(url);
    const row = {
      id: stableId(url),
      url,
      name: p.name,
      store: p.store || "",
      cat: p.cat || "Sin categoría",
      img: safeImage(p.img),
    };
    await db("products?on_conflict=url", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: row,
    });
    const stored = (
      await db(`products?url=eq.${encodeURIComponent(url)}&limit=1`)
    )[0];
    for (const key of ["name", "store", "cat", "img"])
      if (stored[key] !== row[key])
        throw new Error(
          `Importación en conflicto en fila ${index + 1}, campo ${key}. No se sobrescribe.`,
        );
    for (const [ci, c] of (p.comments || []).entries()) {
      const comment = {
        id: stableId(`${url}:comment:${c.id || ci}`),
        product_id: stored.id,
        text: c.text,
        author: c.author === "designer" ? "Diseño" : "Yo",
        created_at: c.at || p.created_at || new Date().toISOString(),
      };
      await db("comments?on_conflict=id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=representation",
        body: comment,
      });
      const saved = (await db(`comments?id=eq.${comment.id}`))[0];
      if (
        saved.text !== comment.text ||
        saved.product_id !== comment.product_id
      )
        throw new Error("Comentario en conflicto");
      comments++;
    }
  }
  console.log(
    JSON.stringify({
      verifiedProducts: legacy.length,
      verifiedComments: comments,
      repeatable: true,
    }),
  );
} else
  throw new Error(
    "Uso: node --env-file=.env.local scripts/migrate.mjs backup|import [archivo]",
  );

if (process.env.LOCAL_DATABASE_PATH)
  await (await (await import("./local-db.mjs")).localConnection()).close();
