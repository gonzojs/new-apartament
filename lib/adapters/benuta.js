import { fetchPublic } from "../net.js";
import { result, cents } from "./catalog.js";
export const config = {
  id: "benuta",
  name: "Benuta",
  host: "www.benuta.es",
  type: "constructor",
  search: true,
  import_link: true,
  method: "Constructor API",
  external: "https://www.benuta.es/search?q=",
};
// Public ES catalogue key published by Benuta's browser application; no account credentials.
const key = "key_5A5cq7rcXTOKOlng";
export function parseBenuta(data) {
  if (!Array.isArray(data.response?.results))
    throw new Error("Respuesta de Benuta no reconocida.");
  return data.response.results.flatMap((p) => {
    const rows = p.variations?.length ? p.variations : [p];
    return rows
      .map((v) => {
        const d = { ...p.data, ...v.data };
        const exact = !!d.variation_id && !!d.size;
        const ownPrice =
          !p.variations?.length || v.data?.variation_id === p.data?.variation_id
            ? d
            : v.data || {};
        if (!p.data?.id) return null;
        const price =
          d.currency_code === "EUR"
            ? cents(
                ownPrice.special_price !== "-" &&
                  Number(ownPrice.special_price) > 0
                  ? ownPrice.special_price
                  : exact
                    ? ownPrice.price
                    : d.parent_price,
              )
            : null;
        const slug = d.url || d.parent_url;
        if (!slug) return null;
        return result(config, {
          product_id: String(p.data.id),
          variant_id: exact ? String(d.variation_id) : null,
          name: d.parent_name || p.value,
          variant: exact ? d.size : "",
          url: new URL(
            slug.endsWith(".html") ? slug : slug + ".html",
            "https://www.benuta.es/",
          ).href,
          img: d.bynder_image_url || d.image_url || d.parent_image_url,
          price_cents: price,
          price_kind: price === null ? "unknown" : exact ? "exact" : "from",
          // Parent stock is not evidence that a particular size is available.
          availability:
            typeof v.data?.in_stock === "boolean"
              ? v.data.in_stock
                ? "in_stock"
                : "out_of_stock"
              : "unknown",
        });
      })
      .filter(Boolean);
  });
}
export async function search(query) {
  const raw = await fetchPublic(
    `https://ac.cnstrc.com/search/${encodeURIComponent(query)}?key=${key}&num_results_per_page=12`,
    ["ac.cnstrc.com"],
  );
  const items = parseBenuta(JSON.parse(raw));
  return {
    items: [
      ...new Map(
        items.map((p) => [p.product_id + ":" + p.variant_id, p]),
      ).values(),
    ].slice(0, 48),
  };
}
export async function getProduct(url, identity = {}) {
  const id =
    identity.product_id ||
    new URL(url).pathname.match(/(\d{8}-\d+)(?:\.html)?$/)?.[1];
  if (!id) throw new Error("No se pudo identificar este producto de Benuta.");
  const { items } = await search(id);
  const matches = items.filter((p) => p.product_id === id);
  if (identity.variant_id) {
    const chosen = matches.find((p) => p.variant_id === identity.variant_id);
    if (!chosen)
      throw new Error("La variante de Benuta ya no aparece en su catálogo.");
    return chosen;
  }
  if (!matches.length) throw new Error("Producto no encontrado en Benuta.");
  if (matches.length === 1) return matches[0];
  const prices = matches.map((p) => p.price_cents).filter((p) => p !== null);
  return {
    ...matches[0],
    url,
    variant: "",
    variant_id: null,
    price_cents: prices.length ? Math.min(...prices) : null,
    price_kind: prices.length ? "from" : "unknown",
    availability: "unknown",
    variants: matches,
  };
}
