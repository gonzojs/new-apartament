import { product, rpc, HttpError } from "./db.js";
import { getProduct } from "./stores.js";
export async function refresh(id, key) {
  if (!(await rpc("acquire_lease", { p_key: `product:${id}`, p_seconds: 120 })))
    throw new HttpError(409, "Este producto ya se está actualizando.");
  const p = await product(id);
  let data;
  try {
    data = await getProduct(p.url);
    if (data.price_cents === null) throw new Error("Precio no disponible.");
  } catch (e) {
    data = { error: e.message };
  }
  return rpc("capture_price", {
    p_id: id,
    p_version: p.version,
    p_data: data,
    p_key: key,
  });
}
