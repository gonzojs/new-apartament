export async function api(path, { method = "GET", body, signal } = {}) {
  const r = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
  });
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "El servidor no devolvió datos de la app. Comprueba el acceso a Vercel o recarga.",
    );
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) window.dispatchEvent(new Event("admin-expired"));
    const error = new Error(d.error || "No se pudo completar la operación.");
    error.status = r.status;
    throw error;
  }
  return d;
}
export const money = (cents) =>
  cents === null || cents === undefined
    ? "Sin precio"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(cents / 100);
export const date = (value) =>
  value
    ? new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Sin comprobar";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const statuses = {
  interested: "Me interesa",
  chosen: "Elegido",
  purchased: "Comprado",
  discarded: "Descartado",
};
export function priceLabel(p) {
  return `${p.price_kind === "from" ? "Desde " : ""}${money(p.price_cents)}`;
}
export function safeHref(url) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
}
