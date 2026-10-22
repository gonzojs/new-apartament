import * as northdeco from "./adapters/northdeco.js";
import * as nooma from "./adapters/nooma.js";
import * as sklum from "./adapters/sklum.js";
import * as themasie from "./adapters/themasie.js";
import * as sweeek from "./adapters/sweeek.js";
import * as benuta from "./adapters/benuta.js";
import { structuredProduct } from "./adapters/catalog.js";
import { canonicalUrl, fetchPublic } from "./net.js";
export { structuredProduct, empathyResult, cents } from "./adapters/catalog.js";
const adapters = { northdeco, nooma, sklum, themasie, benuta, sweeek };
export const STORES = [
  ...Object.values(adapters).map((a) => a.config),
  {
    id: "habitat",
    name: "Habitat",
    host: "www.habitat-design.com",
    search: false,
    import_link: true,
    method: "HTML · JSON-LD / Open Graph",
    external: "https://www.habitat-design.com/es-es/search?q=",
    reason: "Sin búsqueda automática verificada.",
  },
  {
    id: "jysk",
    name: "JYSK",
    host: "jysk.es",
    search: false,
    import_link: true,
    method: "HTML · JSON-LD / Open Graph",
    external: "https://jysk.es/search?query=",
    reason: "Sin búsqueda automática verificada.",
  },
  {
    id: "amazon",
    name: "Amazon",
    host: "www.amazon.es",
    search: false,
    import_link: false,
    method: "Manual",
    external: "https://www.amazon.es/s?k=",
    reason: "Sin acceso gratuito fiable verificado.",
  },
  {
    id: "laredoute",
    name: "La Redoute",
    host: "www.laredoute.es",
    search: false,
    import_link: false,
    method: "HTML · pendiente de acceso",
    external: "https://www.laredoute.es/psrch/psrch.aspx?kwrd=",
    reason:
      "La consulta directa respondió HTTP 403; importación manual disponible.",
  },
  {
    id: "rugvista",
    name: "Rugvista",
    host: "www.rugvista.es",
    search: false,
    import_link: false,
    method: "HTML · pendiente de acceso",
    external: "https://www.rugvista.es/search?query=",
    reason:
      "La consulta directa respondió HTTP 403; importación manual disponible.",
  },
];
export const storeFor = (url) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return STORES.find((s) => s.host.replace(/^www\./, "") === host);
  } catch {
    return undefined;
  }
};
export async function searchStore(id, query) {
  if (!adapters[id]?.search) return { items: [], unsupported: true };
  return adapters[id].search(query);
}
export async function htmlProduct(url) {
  const u = new URL(canonicalUrl(url));
  const host = u.hostname;
  const html = await fetchPublic(u.href, [
    host,
    host.startsWith("www.") ? host.slice(4) : "www." + host,
  ]);
  const data = structuredProduct(html, u.href);
  if (!data.name && !data.img)
    throw new Error("La página no incluye datos de producto legibles.");
  return {
    ...data,
    url: u.href,
    variant: "",
    currency: "EUR",
    observed_at: new Date().toISOString(),
    warnings:
      data.price_cents === null
        ? ["Nombre e imagen recuperados; precio sin verificar."]
        : [],
  };
}
export async function getProduct(url, identity = {}) {
  url = canonicalUrl(url);
  const s = storeFor(url);
  const adapter = adapters[s?.id];
  let warning;
  if (adapter) {
    try {
      return await adapter.getProduct(url, identity);
    } catch (e) {
      warning = e.message;
    }
  }
  const p = await htmlProduct(url);
  // HTML fallback cannot establish a variant selected only by an API identifier.
  if (identity.variant_id) {
    p.price_cents = null;
    p.price_kind = "unknown";
    p.availability = "unknown";
  }
  return {
    ...p,
    store: s?.name || new URL(url).hostname,
    store_id: s?.id || null,
    product_id: null,
    variant_id: null,
    cat: "Sin categoría",
    warnings: [
      ...(warning ? [`API no disponible: ${warning}`] : []),
      ...(p.warnings || []),
    ],
  };
}
