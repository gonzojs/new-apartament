import { endpoint, method } from "../lib/http.js";
import { matches } from "../lib/auth.js";
import { db, rpc, HttpError } from "../lib/db.js";
import { refresh } from "../lib/refresh.js";
export default endpoint(async (req, res) => {
  method(req, "GET");
  if (
    !matches(
      req.headers.authorization,
      process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null,
    )
  )
    throw new HttpError(401, "No autorizado.");
  if (!(await rpc("acquire_lease", { p_key: "daily-prices", p_seconds: 300 })))
    return res.json({ skipped: true });
  const started = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const items = await db(
    `products?status=in.(interested,chosen)&price_kind=neq.manual&or=(attempted_at.is.null,attempted_at.lt.${day}T00:00:00Z)&order=attempted_at.asc.nullsfirst&limit=1000`,
  );
  let index = 0,
    updated = 0,
    failed = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < items.length && Date.now() - started < 230000) {
        const p = items[index++];
        try {
          const r = await refresh(p.id, `daily:${day}`);
          r.refresh_error ? failed++ : updated++;
        } catch {
          failed++;
        }
      }
    }),
  );
  res.json({ updated, failed, pending: items.length - index });
});
