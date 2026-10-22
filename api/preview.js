import { endpoint, method, body } from "../lib/http.js";
import { admin, limit } from "../lib/auth.js";
import { canonicalUrl } from "../lib/net.js";
import { getProduct, storeFor } from "../lib/stores.js";
import { remember } from "../lib/imports.js";
import { measured } from "../lib/store-health.js";
export default endpoint(async (req, res) => {
  method(req, "POST");
  await admin(req);
  await limit("preview", 20, 60);
  const url = canonicalUrl(body(req).url),
    s = storeFor(url);
  let p;
  try {
    p = await measured(s?.id || new URL(url).hostname, "preview", () =>
      getProduct(url),
    );
  } catch (e) {
    return res.json({
      url,
      store: s?.name || new URL(url).hostname,
      name: "",
      img: null,
      price_cents: null,
      price_kind: "unknown",
      currency: "EUR",
      warnings: [
        `${e.message}. Puedes completar los datos y guardar el enlace.`,
      ],
    });
  }
  const variants = p.variants;
  delete p.variants;
  const [saved, ...choices] = await remember([p, ...(variants || [])]);
  res.json({ ...saved, variants: choices });
});
