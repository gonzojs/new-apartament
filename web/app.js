import {
  api,
  money,
  date,
  esc,
  statuses,
  priceLabel,
  safeHref,
} from "./api.js";
const $ = (s) => document.querySelector(s);
let items = [],
  stores = [],
  isAdmin = false,
  editing = null,
  editorImage = null,
  detailId = null,
  searchGeneration = 0,
  searchController = null,
  results = new Map(),
  activeSearchQuery = "",
  toastTimer;
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
function updateAdmin(value) {
  isAdmin = value;
  $("#access").textContent = value ? "Cerrar administración" : "Administrar";
  $("#add").hidden = !value;
  $("#search-lock").hidden = value;
  $("#search-submit").disabled = !value;
  $("#footer-mode").textContent = value
    ? "· Modo administrador"
    : "· Vista pública";
  render();
  if (detailId) openDetail(detailId);
  if (!value) {
    searchController?.abort();
    searchGeneration++;
    $("#editor-dialog").close();
  }
}
window.addEventListener("admin-expired", () => {
  if (isAdmin) {
    updateAdmin(false);
    toast("Tu sesión terminó. Vuelve a introducir la clave.");
  }
});
async function guarded(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
  }
}
function replaceItem(p) {
  const i = items.findIndex((x) => x.id === p.id);
  if (i >= 0) items[i] = p;
  else items.unshift(p);
  render();
}
async function reload() {
  items = await api("products");
  render();
}
function populateSelect(selector, values) {
  const el = $(selector),
    selected = el.value;
  while (el.options.length > 1) el.remove(1);
  [...new Set(values.filter(Boolean))]
    .sort()
    .forEach((value) => el.add(new Option(value, value)));
  el.value = selected;
}
function render() {
  const selected = items.filter((p) => p.status === "chosen"),
    bought = items.filter((p) => p.status === "purchased");
  const total = (list) =>
    list.reduce((n, p) => n + (p.price_cents ?? 0) * p.quantity, 0);
  const unknown = selected.filter((p) => p.price_cents === null).length;
  const approximate = selected.some((p) => p.price_kind === "from");
  $("#summary").innerHTML =
    `<div><strong>${items.length}</strong><span>piezas guardadas</span></div><div><strong>${approximate ? "Desde " : ""}${money(total(selected))}</strong><span>selección elegida</span>${unknown ? `<small>${unknown} sin precio, no incluidos</small>` : ""}</div><div><strong>${money(bought.reduce((n, p) => n + (p.purchased_cents ?? 0) * p.quantity, 0))}</strong><span>comprado</span>${bought.some((p) => p.purchased_cents === null) ? "<small>Hay compras sin importe registrado</small>" : ""}</div>`;
  populateSelect(
    "#filter-cat",
    items.map((p) => p.cat),
  );
  populateSelect(
    "#filter-room",
    items.map((p) => p.room),
  );
  const q = $("#filter-text").value.toLocaleLowerCase("es");
  let filtered = items.filter(
    (p) =>
      (!q ||
        [p.name, p.store, p.room, p.variant]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(q)) &&
      (!$("#filter-status").value || p.status === $("#filter-status").value) &&
      (!$("#filter-cat").value || p.cat === $("#filter-cat").value) &&
      (!$("#filter-room").value || p.room === $("#filter-room").value) &&
      (!$("#filter-favorite").checked || p.favorite),
  );
  if ($("#filter-sort").value === "price")
    filtered.sort(
      (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity),
    );
  if ($("#filter-sort").value === "name")
    filtered.sort((a, b) => a.name.localeCompare(b.name, "es"));
  $("#list-count").textContent = `${filtered.length} productos`;
  $("#products").replaceChildren(...filtered.map((p) => card(p)));
  if (!filtered.length)
    $("#products").innerHTML =
      `<p class="empty">${items.length ? "No hay productos con estos filtros." : "Tu selección empieza aquí. Añade el primer enlace desde el modo administrador."}</p>`;
}
function card(p, discovery = false) {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `<div class="card-thumb">${p.img ? `<img src="${esc(safeHref(p.img))}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb-placeholder" aria-hidden="true">⌂</div>'}${!discovery ? `<button class="favorite" aria-label="${p.favorite ? "Quitar" : "Marcar"} favorito" aria-pressed="${p.favorite}" ${!isAdmin ? "disabled" : ""}>${p.favorite ? "♥" : "♡"}</button>` : ""}</div><div class="card-body"><div class="card-top"><span class="store-name">${esc(p.store)}</span>${!discovery ? `<span class="badge ${p.status}">${statuses[p.status]}</span>` : ""}</div><h3 class="card-name">${esc(p.name)}</h3>${p.variant ? `<p class="muted">${esc(p.variant)}</p>` : ""}<div class="card-price">${esc(priceLabel(p))}</div><p class="availability">${p.price_kind === "manual" ? "Precio manual" : p.refresh_error || (p.checked_at && Date.now() - new Date(p.checked_at).getTime() > 48 * 3600000) ? "Precio sin actualizar" : p.price_kind === "from" ? "Verifica la variante en la tienda" : p.availability === "in_stock" ? "Disponible" : p.availability === "out_of_stock" ? "Agotado" : "Disponibilidad sin verificar"}</p>${!discovery ? `<p class="muted">${esc(p.room || p.cat)}${p.quantity > 1 ? ` · ${p.quantity} unidades` : ""}</p><p class="muted">${p.checked_at ? `Comprobado ${esc(date(p.checked_at))}` : "Sin comprobación automática"}</p>` : ""}<div class="card-actions"><a class="card-link" href="${esc(safeHref(p.url))}" target="_blank" rel="noopener noreferrer">Ver en tienda ↗</a><button class="${discovery ? "primary" : ""}" data-action>${discovery ? "Guardar" : "Detalles"}</button></div></div>`;
  el.querySelector("img")?.addEventListener("error", (e) => {
    e.target.replaceWith(
      Object.assign(document.createElement("div"), {
        className: "thumb-placeholder",
        textContent: "⌂",
      }),
    );
  });
  el.querySelector("[data-action]").addEventListener("click", () =>
    discovery ? openEditor(null, p) : openDetail(p.id),
  );
  el.querySelector(".favorite")?.addEventListener("click", (e) =>
    guarded(e.currentTarget, async () => {
      replaceItem(
        await api("products", {
          method: "PATCH",
          body: { id: p.id, version: p.version, favorite: !p.favorite },
        }),
      );
    }),
  );
  return el;
}
for (const id of [
  "filter-text",
  "filter-status",
  "filter-cat",
  "filter-room",
  "filter-sort",
  "filter-favorite",
])
  $(`#${id}`).addEventListener("input", render);
function tab(discover) {
  $("#list-view").hidden = discover;
  $("#discover-view").hidden = !discover;
  $("#tab-list").classList.toggle("active", !discover);
  $("#tab-discover").classList.toggle("active", discover);
  $("#tab-list").setAttribute("aria-pressed", !discover);
  $("#tab-discover").setAttribute("aria-pressed", discover);
}
$("#tab-list").onclick = () => tab(false);
$("#tab-discover").onclick = () => tab(true);
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#detail-dialog").addEventListener("close", () => (detailId = null));
$("#access").onclick = async () => {
  if (isAdmin)
    await guarded($("#access"), async () => {
      await api("session", { method: "DELETE" });
      updateAdmin(false);
      toast("Administración cerrada.");
    });
  else {
    $("#login-form").reset();
    $("#login-form .form-error").textContent = "";
    $("#login-dialog").showModal();
  }
};
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.currentTarget,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await api("session", {
      method: "POST",
      body: { password: form.elements.password.value },
    });
    form.reset();
    $("#login-dialog").close();
    updateAdmin(true);
    toast("Ya puedes editar tu selección.");
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
function openEditor(id, seed = {}) {
  if (!isAdmin) return;
  editing = id ? items.find((p) => p.id === id) : null;
  const p = editing || seed,
    form = $("#editor-form");
  form.reset();
  editorImage = p.img || null;
  for (const key of [
    "url",
    "name",
    "cat",
    "room",
    "variant",
    "quantity",
    "status",
  ])
    if (p[key] != null) form.elements[key].value = p[key];
  form.elements.favorite.checked = !!p.favorite;
  form.elements.url.readOnly = !!editing;
  form.elements.manual.checked = p.price_kind === "manual";
  form.elements.price.value =
    p.price_cents !== null && p.price_cents !== undefined
      ? p.price_cents / 100
      : "";
  $("#manual-price-label").hidden = !form.elements.manual.checked;
  $("#editor-title").textContent = editing
    ? "Editar producto"
    : "Añadir producto";
  $("#preview-status").textContent =
    seed.price_cents != null ? "El precio se verificará al guardar." : "";
  form.querySelector(".form-error").textContent = "";
  $("#editor-dialog").showModal();
}
$("#add").onclick = () => openEditor();
$("#editor-form").elements.manual.onchange = (e) =>
  ($("#manual-price-label").hidden = !e.target.checked);
let previewSequence = 0;
$("#editor-form").elements.url.oninput = () => {
  previewSequence++;
  editorImage = null;
  $("#preview-status").textContent = "";
};
$("#editor-dialog").addEventListener("close", () => previewSequence++);
$("#preview").onclick = (e) =>
  guarded(e.currentTarget, async () => {
    const form = $("#editor-form"),
      url = form.elements.url.value,
      sequence = ++previewSequence;
    $("#preview-status").textContent = "Consultando la tienda…";
    try {
      const p = await api("preview", { method: "POST", body: { url } });
      if (sequence !== previewSequence) return;
      if (!form.elements.name.value) form.elements.name.value = p.name || "";
      form.elements.variant.value = p.variant || form.elements.variant.value;
      editorImage = p.img;
      $("#preview-status").textContent = priceLabel(p);
    } catch (err) {
      if (sequence === previewSequence)
        $("#preview-status").textContent = err.message;
    }
  });
$("#editor-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.currentTarget,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  const b = Object.fromEntries(new FormData(form));
  b.quantity = Number(b.quantity);
  b.favorite = form.elements.favorite.checked;
  b.img = editorImage;
  const isManual = form.elements.manual.checked;
  if (isManual)
    b.manual_price_cents =
      b.price === "" ? null : Math.round(Number(b.price) * 100);
  else if (editing?.price_kind === "manual") b.manual_price_cents = null;
  delete b.price;
  delete b.manual;
  if (editing) {
    b.id = editing.id;
    b.version = editing.version;
  }
  try {
    const p = await api("products", {
      method: editing ? "PATCH" : "POST",
      body: b,
    });
    replaceItem(p);
    $("#editor-dialog").close();
    toast("Producto guardado.");
    if (detailId === p.id) openDetail(p.id);
    if (!isManual && p.price_kind !== "manual" && !p.checked_at)
      api("refresh", { method: "POST", body: { id: p.id } })
        .then((updated) => {
          replaceItem(updated);
          if (detailId === p.id) openDetail(p.id);
          if (updated.refresh_error)
            toast("Guardado. El precio requiere revisión manual.");
        })
        .catch(() =>
          toast("Producto guardado; podrás actualizar su precio más tarde."),
        );
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
let detailSequence = 0;
async function openDetail(id) {
  const p = items.find((x) => x.id === id);
  if (!p) return;
  detailId = id;
  const sequence = ++detailSequence;
  $("#detail").innerHTML =
    `<p class="eyebrow-label">${esc(p.store)} · ${esc(p.cat)}</p><h2>${esc(p.name)}</h2>${p.img ? `<img src="${esc(safeHref(p.img))}" alt="${esc(p.name)}">` : ""}<p class="detail-price">${esc(priceLabel(p))}</p><p class="muted">${esc(p.variant || "Sin variante especificada")} · ${p.quantity} unidades · ${statuses[p.status]}</p><p class="muted">${p.price_kind === "manual" ? "Precio introducido manualmente" : `Última comprobación: ${esc(date(p.checked_at))}`}</p>${p.refresh_error ? `<p class="notice">${esc(p.refresh_error)} · Último intento: ${esc(date(p.attempted_at))}</p>` : ""}<a class="external" href="${esc(safeHref(p.url))}" target="_blank" rel="noopener noreferrer">Abrir producto en ${esc(p.store)} ↗</a>${isAdmin ? '<div class="inline"><button class="secondary" id="edit-detail">Editar</button><button class="secondary" id="refresh-detail">Actualizar precio</button><button class="secondary" id="delete-detail">Eliminar</button></div>' : ""}<h3>Historial de precios</h3><div id="history-content">Cargando historial…</div><h3>Comentarios</h3><div id="comments-content">Cargando comentarios…</div>${isAdmin ? '<form id="comment-form"><label>Nuevo comentario<textarea name="text" required maxlength="4000" rows="3"></textarea></label><p class="form-error" role="alert"></p><button class="primary">Añadir comentario</button></form>' : ""}`;
  if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
  $("#edit-detail")?.addEventListener("click", () => openEditor(id));
  $("#refresh-detail")?.addEventListener("click", (e) =>
    guarded(e.currentTarget, async () => {
      const updated = await api("refresh", { method: "POST", body: { id } });
      replaceItem(updated);
      await openDetail(id);
      toast(
        updated.refresh_error
          ? "No se pudo verificar el precio. Se conserva el anterior."
          : "Precio actualizado.",
      );
    }),
  );
  $("#delete-detail")?.addEventListener("click", () => {
    $("#confirm-dialog").returnValue = "cancel";
    $("#confirm-dialog").showModal();
    $("#confirm-dialog").onclose = async () => {
      if ($("#confirm-dialog").returnValue !== "delete") return;
      try {
        await api(`products?id=${id}`, { method: "DELETE" });
        items = items.filter((x) => x.id !== id);
        $("#detail-dialog").close();
        render();
        toast("Producto eliminado.");
      } catch (err) {
        toast(err.message);
      }
    };
  });
  const historyPromise = api(`history?product_id=${id}`)
    .then((history) => {
      if (detailId !== id || sequence !== detailSequence) return;
      renderHistory(history);
    })
    .catch((e) => {
      if (detailId === id && sequence === detailSequence)
        $("#history-content").textContent = e.message;
    });
  let commentKey = crypto.randomUUID();
  $("#comment-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      await api("comments", {
        method: "POST",
        body: { id: commentKey, product_id: id, text: f.elements.text.value },
      });
      commentKey = crypto.randomUUID();
      f.reset();
      await loadComments(id, sequence);
    } catch (err) {
      f.querySelector(".form-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
  await Promise.allSettled([historyPromise, loadComments(id, sequence)]);
}
async function loadComments(id, sequence) {
  try {
    const comments = await api(`comments?product_id=${id}`);
    if (detailId !== id || sequence !== detailSequence) return;
    $("#comments-content").innerHTML = comments.length
      ? comments
          .map(
            (c) =>
              `<div class="comment"><div class="comment-meta"><span>${esc(date(c.created_at))}</span>${isAdmin ? `<button data-delete-comment="${c.id}" aria-label="Eliminar comentario">Eliminar</button>` : ""}</div>${esc(c.text)}</div>`,
          )
          .join("")
      : '<p class="muted">Aún no hay comentarios.</p>';
    document.querySelectorAll("[data-delete-comment]").forEach(
      (b) =>
        (b.onclick = () =>
          guarded(b, async () => {
            await api(`comments?id=${b.dataset.deleteComment}`, {
              method: "DELETE",
            });
            await loadComments(id, sequence);
          })),
    );
  } catch (e) {
    if (detailId === id && sequence === detailSequence)
      $("#comments-content").textContent = e.message;
  }
}
function renderHistory(history) {
  if (!history.length) {
    $("#history-content").innerHTML =
      '<p class="muted">El historial empieza con la primera comprobación o precio manual.</p>';
    return;
  }
  const sorted = [...history].reverse(),
    values = sorted.map((h) => h.price_cents),
    min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${10 + (i / (values.length - 1 || 1)) * 480},${100 - ((v - min) / range) * 80}`,
    )
    .join(" ");
  $("#history-content").innerHTML =
    `${values.length > 1 ? `<svg class="history-chart" role="img" aria-label="Evolución del precio: mínimo ${esc(money(min))}, máximo ${esc(money(Math.max(...values)))}" viewBox="0 0 500 120"><polyline class="history-line" points="${points}"/></svg>` : ""}<table class="history"><thead><tr><th>Fecha</th><th>Precio</th><th>Origen</th></tr></thead><tbody>${history.map((h) => `<tr><td>${esc(date(h.observed_at))}</td><td>${h.kind === "from" ? "Desde " : ""}${money(h.price_cents)}</td><td>${h.source === "manual" ? "Manual" : "Tienda"}</td></tr>`).join("")}</tbody></table>`;
}
$("#search-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!isAdmin) return;
  const q = $("#search-query").value.trim();
  if (q.length < 2) return;
  searchController?.abort();
  searchController = new AbortController();
  activeSearchQuery = q;
  const signal = searchController.signal,
    generation = ++searchGeneration;
  results = new Map(
    stores.map((s) => [
      s.id,
      { status: s.search ? "loading" : "unsupported", items: [] },
    ]),
  );
  renderSearch();
  await Promise.allSettled(
    stores
      .filter((s) => s.search)
      .map(async (s) => {
        try {
          const data = await api("search", {
            method: "POST",
            body: { store: s.id, query: q },
            signal,
          });
          if (generation !== searchGeneration) return;
          results.set(s.id, {
            status: "done",
            items: data.items,
            cached: data.cached,
            query: q,
          });
        } catch (err) {
          if (signal.aborted || generation !== searchGeneration) return;
          results.set(s.id, { status: "error", items: [], error: err.message });
        }
        if (generation === searchGeneration) renderSearch();
      }),
  );
};
function renderSearch() {
  const container = $("#search-results");
  container.replaceChildren();
  for (const s of stores) {
    if ($("#search-store").value && $("#search-store").value !== s.id) continue;
    const r = results.get(s.id);
    if (!r) continue;
    const section = document.createElement("section");
    section.className = "search-group";
    const status =
      r.status === "loading"
        ? "Buscando…"
        : r.status === "unsupported"
          ? "Búsqueda externa"
          : r.status === "error"
            ? "No disponible"
            : `${r.items.length} resultados${r.cached ? " · consulta reciente" : ""}`;
    section.innerHTML = `<h3>${esc(s.name)}<span class="group-status">${r.status === "loading" ? '<span class="loading-dot"></span>' : ""}${status}</span></h3>${r.error ? `<p class="muted">${esc(r.error)}</p>` : ""}${r.status === "unsupported" ? '<p class="muted">Integración automática no disponible. Puedes guardar el enlace y añadir el precio manualmente.</p>' : ""}<a class="external" href="${esc(s.external + encodeURIComponent(activeSearchQuery))}" target="_blank" rel="noopener noreferrer">Buscar en ${esc(s.name)} ↗</a><div class="grid"></div>`;
    let products = r.items.filter(
      (p) =>
        $("#search-max").value === "" ||
        (p.price_cents !== null &&
          p.price_cents <= Number($("#search-max").value) * 100),
    );
    if ($("#search-sort").value === "price")
      products.sort(
        (a, b) => (a.price_cents ?? Infinity) - (b.price_cents ?? Infinity),
      );
    section
      .querySelector(".grid")
      .append(...products.map((p) => card(p, true)));
    if (r.status === "done" && !products.length)
      section.querySelector(".grid").innerHTML =
        '<p class="muted">No hay resultados para esta búsqueda y filtros.</p>';
    container.append(section);
  }
}
for (const id of ["search-store", "search-max", "search-sort"])
  $(`#${id}`).oninput = renderSearch;
async function init() {
  try {
    const [products, session, registry] = await Promise.all([
      api("products"),
      api("session"),
      api("search"),
    ]);
    items = products;
    stores = registry;
    stores.forEach((s) => $("#search-store").add(new Option(s.name, s.id)));
    updateAdmin(session.admin);
    try {
      $("#legacy-notice").hidden = !JSON.parse(
        localStorage.getItem("apt-favs") || "[]",
      ).length;
    } catch {}
  } catch (e) {
    $("#products").innerHTML =
      `<div class="empty"><p>${esc(e.message)}</p><button class="secondary" id="retry-load">Reintentar</button></div>`;
    $("#retry-load").onclick = init;
  }
}
init();
