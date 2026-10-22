import { STORES, searchStore, getProduct } from "../lib/stores.js";
let failed = 0;
for (const s of STORES) {
  if (!s.search) {
    console.log(`${s.name}: búsqueda externa / carga manual`);
    continue;
  }
  try {
    const r = await searchStore(s.id, s.id === "benuta" ? "alfombra" : "mesa");
    if (!r.items.length) throw new Error("Sin resultados");
    const p = await getProduct(r.items[0].url, r.items[0]);
    if (p.price_cents === null || p.currency !== "EUR")
      throw new Error("Precio no verificado");
    console.log(
      `${s.name}: ${r.items.length} resultados; precio ${p.price_cents / 100} EUR (${p.price_kind})`,
    );
  } catch (e) {
    failed++;
    console.error(`${s.name}: ${e.message}`);
  }
}
if (failed) process.exitCode = 1;
