export async function api(path, { method = "GET", body, signal } = {}) {
  const r = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) window.dispatchEvent(new Event("admin-expired"));
    throw new Error(d.error || "No se pudo completar la operación.");
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
