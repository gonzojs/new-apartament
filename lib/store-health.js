import { db } from "./db.js";
export async function measured(store, operation, fn) {
  const start = Date.now();
  let error, result;
  try {
    result = await fn();
    return result;
  } catch (e) {
    error = e.message;
    throw e;
  } finally {
    const value = {
      store,
      operation,
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      status: error
        ? "error"
        : operation === "preview" && result?.price_cents === null
          ? "partial"
          : "ok",
      error: error || result?.warnings?.join(" ") || null,
    };
    console.info(JSON.stringify({ event: "store", ...value }));
    // Diagnostics never turn a successful store response into a failed import.
    await db("store_health?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: { id: store + ":" + operation, value },
    }).catch(() =>
      console.warn(
        JSON.stringify({ event: "health_storage_failed", store, operation }),
      ),
    );
  }
}
