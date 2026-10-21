process.env.LOCAL_DATABASE_PATH = "memory://";
process.env.ADMIN_PASSWORD = "test-password-not-for-production";
process.env.PORT = "3100";
process.env.CRON_SECRET = "test-cron-secret";
await import("./local-db.mjs");
const { rpc } = await import("../lib/db.js");
const { productData } = await import("../lib/validation.js");
await rpc("save_product", {
  p_data: productData({
    url: "https://example.com/fixture",
    name: "Sofá de prueba",
    cat: "Sofás y Asientos",
    manual_price_cents: 49900,
    room: "Salón",
    status: "chosen",
  }),
  p_id: null,
  p_version: null,
});
await import("./dev.mjs");
