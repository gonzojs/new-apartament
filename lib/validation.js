import { HttpError } from "./db.js";
import { canonicalUrl, safeImage } from "./net.js";
import { identityFor } from "./imports.js";
import { storeFor } from "./stores.js";
const text = (v, max = 200) => {
  if (typeof v !== "string" || v.length > max)
    throw new HttpError(400, "Texto inválido.");
  return v.trim();
};
export function productData(input, previous, observation) {
  const name = text(input.name ?? previous?.name ?? "");
  if (!name) throw new HttpError(400, "Falta el nombre.");
  const url = previous?.url || canonicalUrl(text(input.url, 2048));
  const status = input.status ?? previous?.status ?? "interested";
  if (!["interested", "chosen", "purchased", "discarded"].includes(status))
    throw new HttpError(400, "Estado inválido.");
  const quantity = input.quantity ?? previous?.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
    throw new HttpError(400, "Cantidad inválida.");
  const manual_changed = Object.hasOwn(input, "manual_price_cents");
  const price = manual_changed
    ? input.manual_price_cents
    : (previous?.price_cents ?? observation?.price_cents ?? null);
  if (
    price !== null &&
    (!Number.isSafeInteger(price) || price < 0 || price > 10000000000)
  )
    throw new HttpError(400, "Precio inválido.");
  const favorite = input.favorite ?? previous?.favorite ?? false;
  if (typeof favorite !== "boolean")
    throw new HttpError(400, "Favorito inválido.");
  return {
    url,
    identity_key:
      previous?.identity_key ||
      observation?.identity_key ||
      identityFor({ url }),
    store_id: previous?.store_id || observation?.store_id || null,
    product_id: previous?.product_id || observation?.product_id || null,
    variant_id: previous?.variant_id || observation?.variant_id || null,
    price_source: observation?.price_source || null,
    checked_at:
      !manual_changed && price !== null
        ? observation?.observed_at || previous?.checked_at || null
        : null,
    availability:
      observation?.availability || previous?.availability || "unknown",
    name,
    store: previous?.store || storeFor(url)?.name || new URL(url).hostname,
    cat:
      text(input.cat ?? previous?.cat ?? "Sin categoría", 80) ||
      "Sin categoría",
    room: text(input.room ?? previous?.room ?? "", 80),
    variant: text(input.variant ?? previous?.variant ?? ""),
    img: Object.hasOwn(input, "img")
      ? safeImage(input.img)
      : previous?.img || observation?.img || null,
    image_locked:
      !!previous?.image_locked ||
      (Object.hasOwn(input, "img") &&
        safeImage(input.img) !== (previous?.img || observation?.img || null)),
    quantity,
    status,
    favorite,
    price_cents: price,
    price_kind: manual_changed
      ? price === null
        ? "unknown"
        : "manual"
      : previous?.price_kind || observation?.price_kind || "unknown",
    manual_changed,
    purchased_cents:
      status === "purchased"
        ? previous?.status === "purchased" && !manual_changed
          ? previous.purchased_cents
          : price
        : null,
  };
}
