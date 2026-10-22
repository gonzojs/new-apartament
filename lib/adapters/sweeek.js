import { randomUUID } from "node:crypto";
import { fetchPublic, canonicalUrl } from "../net.js";
import { cents, result, getCatalogProduct } from "./catalog.js";
export const config = {
  id: "sweeek",
  name: "Sweeek",
  host: "www.sweeek.es",
  type: "sensefuel",
  search: true,
  import_link: true,
  method: "Sensefuel API + HTML",
  external: "https://www.sweeek.es/?sfterm=",
};
export function parseSweeek(data) {
  if (!Array.isArray(data.products))
    throw new Error("Respuesta de Sweeek no reconocida.");
  return [
    ...new Map(
      data.products
        .flatMap((p) =>
          (p.variants?.length ? p.variants : [p]).map((v) => {
            const d = { ...p, ...v },
              price = d.currency_code === "EUR" ? cents(d.price) : null;
            return result(config, {
              name: d.title,
              url: d.link,
              img: d.image_link,
              product_id: String(d.article_id || d.id),
              variant_id: null,
              variant: d.color || "",
              price_cents: price,
              price_kind: price === null ? "unknown" : "exact",
              availability:
                d.availability === "in stock"
                  ? "in_stock"
                  : d.availability === "out of stock"
                    ? "out_of_stock"
                    : "unknown",
            });
          }),
        )
        .map((p) => [p.product_id, p]),
    ).values(),
  ].slice(0, 48);
}
export async function search(query) {
  const text = await fetchPublic(
    `https://api.sensefuel.live/5633de4b-cd11-4225-8670-59acbd7de54c/search/products?q=${encodeURIComponent(query)}&from=0&size=16&variants=extended&spellcheck=true`,
    ["api.sensefuel.live"],
    {
      headers: {
        "X-API-KEY": "a88703a5-75a4-46bd-b4fa-47199b336d7f",
        "X-SESSION-ID": randomUUID(),
        "X-SEARCH-KEY": randomUUID(),
      },
    },
  );
  return { items: parseSweeek(JSON.parse(text)) };
}
export async function getProduct(url, identity = {}) {
  // Sensefuel text search does not reliably match SKUs. Product HTML includes an
  // exact Offer on the current ProductGroup URL, independently of search ranking.
  const p = await getCatalogProduct(config, url);
  if (
    identity.product_id &&
    p.product_id &&
    p.product_id !== identity.product_id
  )
    throw new Error("La página corresponde a otro artículo.");
  return p;
}
