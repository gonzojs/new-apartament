import { load } from "cheerio";
import { canonicalUrl, fetchPublic, safeImage } from "./net.js";
export const STORES = [
  {
    id: "northdeco",
    name: "Northdeco",
    host: "northdeco.com",
    type: "shopify",
    search: true,
    external: "https://northdeco.com/search?q=",
  },
  {
    id: "nooma",
    name: "noo.ma",
    host: "noo.ma",
    type: "shopify",
    search: true,
    external: "https://noo.ma/search?q=",
  },
  {
    id: "sklum",
    name: "Sklum",
    host: "www.sklum.com",
    type: "empathy",
    search: true,
    external: "https://www.sklum.com/es/buscar?query=",
  },
  {
    id: "themasie",
    name: "The Masie",
    host: "www.themasie.com",
    type: "empathy",
    search: true,
    external: "https://www.themasie.com/es/buscar?query=",
  },
  {
    id: "habitat",
    name: "Habitat",
    host: "www.habitat-design.com",
    type: "structured",
    search: false,
    external: "https://www.habitat-design.com/es-es/search?q=",
  },
  {
    id: "jysk",
    name: "JYSK",
    host: "jysk.es",
    type: "structured",
    search: false,
    external: "https://jysk.es/search?query=",
  },
  {
    id: "amazon",
    name: "Amazon",
    host: "www.amazon.es",
    type: "manual",
    search: false,
    external: "https://www.amazon.es/s?k=",
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
export const cents = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1e8 ? Math.round(n * 100) : null;
};
const currencyChecks = new Map();
async function verifyEuro(s, prefix = "") {
  const key = s.id + prefix;
  if (Date.now() - (currencyChecks.get(key) || 0) < 900000) return;
  const cart = await json(
    `https://${s.host}${prefix}/cart.js?currency=EUR`,
    allowed(s),
  );
  if (cart.currency !== "EUR")
    throw new Error("La tienda no está devolviendo precios en euros.");
  currencyChecks.set(key, Date.now());
}
const allowed = (s) => [
  s.host,
  s.host.startsWith("www.") ? s.host.slice(4) : `www.${s.host}`,
];
const json = async (u, hosts) => JSON.parse(await fetchPublic(u, hosts));
function result(s, p) {
  return {
    ...p,
    url: canonicalUrl(p.url),
    img: safeImage(p.img),
    store: s.name,
    store_id: s.id,
    currency: "EUR",
    cat: "Sin categoría",
    price_source: s.type,
    observed_at: new Date().toISOString(),
  };
}
export function empathyResult(s, p) {
  const d = JSON.parse(p.renderData),
    selected = d.c?.find((c) => String(c.id) === String(d.sC));
  const price = cents(selected?.p?.["3"]);
  return result(s, {
    name: p.shopTitle,
    url: p.shopUrl,
    img: p.shopImageUrl,
    variant: d.a?.find((a) => a.id === selected?.a)?.name || "",
    price_cents: price,
    price_kind: price === null ? "unknown" : "exact",
    availability: selected?.s?.iS ? "in_stock" : "unknown",
  });
}
export async function searchStore(id, query) {
  const s = STORES.find((x) => x.id === id);
  if (!s?.search) return { items: [], unsupported: true };
  if (s.type === "shopify") {
    await verifyEuro(s);
    const d = await json(
      `https://${s.host}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10&currency=EUR`,
      allowed(s),
    );
    if (!Array.isArray(d.resources?.results?.products))
      throw new Error("Formato de tienda no reconocido");
    return {
      items: d.resources.results.products.map((p) =>
        result(s, {
          name: p.title,
          url: new URL(p.url, `https://${s.host}`).href,
          img: p.image,
          variant: "",
          price_cents: cents(p.price_min ?? p.price),
          price_kind: "from",
          availability: p.available ? "in_stock" : "out_of_stock",
        }),
      ),
    };
  }
  const d = await json(
    `https://api.empathy.co/search/v1/query/${s.id}/search?query=${encodeURIComponent(query)}&lang=es_ES&currency=EUR&rows=16&start=0&instance=${s.id}&scope=desktop&internal=false`,
    ["api.empathy.co"],
  );
  if (!Array.isArray(d.catalog?.content))
    throw new Error("Formato de tienda no reconocido");
  return {
    items: d.catalog.content.flatMap((p) => {
      try {
        return [empathyResult(s, p)];
      } catch {
        return [];
      }
    }),
  };
}
export function structuredProduct(html, url) {
  const $ = load(html);
  const nodes = [];
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if ([n["@type"]].flat().includes("Product")) nodes.push(n);
    if (n["@graph"]) walk(n["@graph"]);
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  const n =
    nodes.find((p) => p.url && canonicalSafe(p.url) === canonicalSafe(url)) ||
    (nodes.length === 1 ? nodes[0] : null);
  const offers = [n?.offers].flat().filter(Boolean);
  const offer =
    offers.find((o) => o.url && canonicalSafe(o.url) === canonicalSafe(url)) ||
    (offers.length === 1 ? offers[0] : null);
  const selected = new URL(url).searchParams;
  const ambiguous =
    ["variant", "id_c"].some((k) => selected.has(k)) &&
    !(offer?.url && canonicalSafe(offer.url) === canonicalSafe(url));
  const currency = offer?.priceCurrency;
  const price =
    currency === "EUR" && !ambiguous
      ? cents(offer.price ?? offer.lowPrice)
      : null;
  return {
    name:
      n?.name ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text(),
    img: safeImage(
      [n?.image].flat()[0]?.url ||
        [n?.image].flat()[0] ||
        $('meta[property="og:image"]').attr("content"),
    ),
    price_cents: price,
    price_kind:
      price === null ? "unknown" : offer.price !== undefined ? "exact" : "from",
    availability: String(offer?.availability || "").includes("InStock")
      ? "in_stock"
      : "unknown",
    price_source: "structured",
  };
}
function canonicalSafe(u) {
  try {
    return canonicalUrl(u);
  } catch {
    return "";
  }
}
export async function getProduct(url) {
  const s = storeFor(url);
  if (!s || s.type === "manual")
    throw new Error("Esta tienda requiere introducir el precio manualmente.");
  const u = new URL(canonicalUrl(url));
  u.hostname = s.host;
  if (s.type === "shopify") {
    const match = u.pathname.match(/\/products\/([^/]+)/);
    if (!match) throw new Error("Usa el enlace de un producto.");
    // Locale and explicit EUR are required: no guessed conversion of shop currencies.
    const prefix = u.pathname
      .split("/products/")[0]
      .replace(/\/collections\/[^/]+$/, "");
    await verifyEuro(s, prefix);
    const p = await json(
      `https://${s.host}${prefix}/products/${match[1]}.js?currency=EUR`,
      allowed(s),
    );
    const chosen = u.searchParams.get("variant");
    const variant = chosen
      ? p.variants?.find((v) => String(v.id) === chosen)
      : p.variants?.length === 1
        ? p.variants[0]
        : null;
    if (chosen && !variant)
      throw new Error("La variante guardada ya no está disponible.");
    const raw = variant?.price ?? p.price_min;
    const price = Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
    return result(s, {
      name: p.title,
      url: u.href,
      img: variant?.featured_image?.src || p.featured_image,
      variant: variant?.title || "",
      price_cents: price,
      price_kind: variant ? "exact" : "from",
      availability: (variant ?? p).available ? "in_stock" : "out_of_stock",
    });
  }
  if (s.type === "empathy") {
    const productId = u.pathname.match(/\/(\d+)-/)?.[1];
    const wanted = u.searchParams.get("id_c");
    const d = await searchStore(s.id, productId || u.pathname.split("/").pop());
    const matches = d.items.filter(
      (p) => new URL(p.url).pathname.match(/\/(\d+)-/)?.[1] === productId,
    );
    const exact = matches.find(
      (p) => wanted && new URL(p.url).searchParams.get("id_c") === wanted,
    );
    if (exact) return exact;
    // Query results expose all combinations in renderData; use them to resolve saved variants.
    if (productId) {
      const raw = await json(
        `https://api.empathy.co/search/v1/query/${s.id}/search?query=${productId}&lang=es_ES&currency=EUR&rows=16`,
        ["api.empathy.co"],
      );
      for (const p of raw.catalog?.content || []) {
        let rd;
        try {
          rd = JSON.parse(p.renderData);
        } catch {
          continue;
        }
        if (String(rd.id) !== productId) continue;
        if (wanted) {
          const c = rd.c?.find((c) => String(c.id) === wanted);
          if (!c) continue;
          rd.sC = c.id;
          return empathyResult(s, {
            ...p,
            shopUrl: u.href,
            renderData: JSON.stringify(rd),
          });
        }
        const prices =
          rd.c?.map((c) => cents(c.p?.["3"])).filter((n) => n !== null) || [];
        return {
          ...empathyResult(s, p),
          url: u.href,
          price_cents: prices.length ? Math.min(...prices) : null,
          price_kind: "from",
          variant: "",
        };
      }
    }
    throw new Error("No se pudo verificar esta variante.");
  }
  const data = structuredProduct(await fetchPublic(u.href, allowed(s)), u.href);
  if (data.price_cents === null)
    throw new Error(
      "La tienda no publica un precio verificable para esta variante.",
    );
  return result(s, { ...data, url: u.href, variant: "" });
}
