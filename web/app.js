import { runStores } from "./search-queue.js";
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
  $("#search-submit").textContent = value
    ? "Buscar en tiendas"
    : "Entrar para buscar";
  $("#tab-stores").hidden = !value;
  if (!value && !$("#stores-view").hidden) tab(false);
  $("#footer-mode").textContent = value
    ? "· Modo administrador"
    : "· Vista pública";
  render();
  if (detailId) openDetail(detailId);
  if (!value) {
    searchController?.abort();
    searchGeneration++;
    for (const [id, r] of results)
      if (r.status === "loading")
        results.set(id, {
          ...r,
          status: "error",
          error: "La búsqueda se detuvo. Introduce la clave para continuar.",
        });
    if (results.size) renderSearch();
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
  const existing = discovery
    ? items.find((x) =>
        p.identity_key
          ? x.identity_key === p.identity_key
          : x.url === p.url && !x.variant_id && !p.variant_id,
      )
    : null;
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `<div class="card-thumb">${p.img ? `<img src="${esc(safeHref(p.img))}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb-placeholder" aria-hidden="true">⌂</div>'}${!discovery ? `<button class="favorite" aria-label="${p.favorite ? "Quitar" : "Marcar"} favorito" aria-pressed="${p.favorite}" ${!isAdmin ? "disabled" : ""}>${p.favorite ? "♥" : "♡"}</button>` : ""}</div><div class="card-body"><div class="card-top"><span class="store-name">${esc(p.store)}</span>${!discovery ? `<span class="badge ${p.status}">${statuses[p.status]}</span>` : ""}</div><h3 class="card-name">${esc(p.name)}</h3>${p.variant ? `<p class="muted">${esc(p.variant)}</p>` : ""}<div class="card-price">${esc(priceLabel(p))}</div><p class="availability">${p.price_kind === "manual" ? "Precio manual" : p.refresh_error || (p.checked_at && Date.now() - new Date(p.checked_at).getTime() > 48 * 3600000) ? "Precio sin actualizar" : p.price_kind === "from" ? "Verifica la variante en la tienda" : p.availability === "in_stock" ? "Disponible" : p.availability === "out_of_stock" ? "Agotado" : "Disponibilidad sin verificar"}</p>${!discovery ? `<p class="muted">${esc(p.room || p.cat)}${p.quantity > 1 ? ` · ${p.quantity} unidades` : ""}</p><p class="muted">${p.checked_at ? `Comprobado ${esc(date(p.checked_at))}` : "Sin comprobación automática"}</p>` : ""}<div class="card-actions"><a class="card-link" href="${esc(safeHref(p.url))}" target="_blank" rel="noopener noreferrer">Ver en tienda ↗</a><button class="${discovery ? "primary" : ""}" data-action>${discovery ? (existing ? "Ya guardado · Ver" : "Guardar") : "Detalles"}</button></div>${!discovery && isAdmin ? `<label class="purchase-toggle ${p.status === "purchased" ? "is-checked" : ""}"><input type="checkbox" data-purchased ${p.status === "purchased" ? "checked" : ""} aria-label="${p.status === "purchased" ? "Quitar marca de comprado" : "Marcar como comprado"}: ${esc(p.name)}" /> Comprado</label>` : ""}</div>`;
  el.querySelector("img")?.addEventListener("error", (e) => {
    e.target.replaceWith(
      Object.assign(document.createElement("div"), {
        className: "thumb-placeholder",
        textContent: "⌂",
      }),
    );
  });
  el.querySelector("[data-action]").addEventListener("click", () =>
    discovery
      ? existing
        ? openDetail(existing.id)
        : openEditor(null, p)
      : openDetail(p.id),
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
  el.querySelector("[data-purchased]")?.addEventListener("change", (e) => {
    const checkbox = e.currentTarget;
    guarded(checkbox, async () => {
      try {
        const updated = await api("products", {
          method: "PATCH",
          body: {
            id: p.id,
            version: p.version,
            status: checkbox.checked ? "purchased" : "interested",
          },
        });
        replaceItem(updated);
        if (detailId === updated.id) await openDetail(updated.id);
        toast(
          updated.status === "purchased"
            ? "Marcado como comprado."
            : "Producto pendiente de compra.",
        );
      } catch (error) {
        checkbox.checked = p.status === "purchased";
        throw error;
      }
    });
  });
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
  $("#stores-view").hidden = true;
  $("#tab-stores").classList.remove("active");
  $("#tab-stores").setAttribute("aria-pressed", "false");
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
    if (pendingSearch) {
      pendingSearch = false;
      startSearch();
    }
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  } finally {
    button.disabled = false;
  }
};
let importCandidate = null,
  previewController = null,
  previewTimer,
  previewSequence = 0,
  fieldRevisions = {},
  previewVariants = [];
function cancelPreview() {
  clearTimeout(previewTimer);
  previewController?.abort();
  previewSequence++;
}
function showEditorImage() {
  const value = $("#editor-form").elements.img.value.trim();
  editorImage = value || null;
  $("#editor-image").hidden = !value;
  $("#editor-image-error").hidden = true;
  if (value) $("#editor-image").src = safeHref(value);
}
$("#editor-image").onerror = () => {
  $("#editor-image").hidden = true;
  $("#editor-image-error").hidden = false;
};
function showObservation(p) {
  const el = $("#editor-observation");
  el.hidden = !p;
  if (p)
    el.textContent = `${p.store || ""} · ${priceLabel(p)} · ${p.currency || "EUR"} · ${p.availability === "in_stock" ? "Disponible" : p.availability === "out_of_stock" ? "Agotado" : "Disponibilidad sin verificar"} · ${p.observed_at ? date(p.observed_at) : "Sin comprobar"}${p.warnings?.length ? " · " + p.warnings.join(" ") : ""}`;
}
function applyCandidate(p, revisions = {}) {
  const form = $("#editor-form");
  importCandidate = p.import_ref ? p : null;
  for (const key of ["name", "variant", "img"]) {
    if ((fieldRevisions[key] || 0) === (revisions[key] || 0))
      form.elements[key].value = p[key] || "";
  }
  showEditorImage();
  showObservation(p);
  $("#preview-status").textContent = p.import_ref
    ? "Información recibida. Revisa y guarda."
    : (p.warnings || []).join(" ");
}
function openEditor(id, seed = {}) {
  if (!isAdmin) {
    $("#access").click();
    return;
  }
  cancelPreview();
  fieldRevisions = {};
  previewVariants = [];
  editing = id ? items.find((p) => p.id === id) : null;
  const p = editing || seed,
    form = $("#editor-form");
  form.reset();
  for (const key of [
    "url",
    "name",
    "img",
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
  form.elements.price.value = p.price_cents != null ? p.price_cents / 100 : "";
  $("#manual-price-label").hidden = !form.elements.manual.checked;
  $("#editor-title").textContent = editing
    ? "Editar producto"
    : "Añadir producto";
  $("#preview-status").textContent = "";
  form.querySelector(".form-error").textContent = "";
  $("#discard-import").hidden = true;
  $("#variant-choice-label").hidden = true;
  importCandidate = seed.import_ref ? seed : null;
  showObservation(importCandidate);
  showEditorImage();
  $("#editor-dialog").showModal();
}
$("#add").onclick = () => openEditor();
$("#editor-form").elements.manual.onchange = (e) =>
  ($("#manual-price-label").hidden = !e.target.checked);
for (const key of ["name", "variant", "img"])
  $("#editor-form").elements[key].addEventListener("input", () => {
    fieldRevisions[key] = (fieldRevisions[key] || 0) + 1;
    if (key === "img") showEditorImage();
    if (key === "variant" && importCandidate) {
      importCandidate = null;
      showObservation(null);
      $("#preview-status").textContent =
        "Variante editada. Selecciona la variante de la tienda o indica un precio manual.";
    }
  });
$("#editor-form").elements.url.oninput = () => {
  cancelPreview();
  importCandidate = null;
  showObservation(null);
  $("#variant-choice-label").hidden = true;
  $("#preview-status").textContent = "";
  // Clear only fields supplied automatically, retaining deliberate user corrections.
  for (const key of ["name", "variant", "img"])
    if (!fieldRevisions[key]) $("#editor-form").elements[key].value = "";
  showEditorImage();
  const value = $("#editor-form").elements.url.value;
  try {
    const u = new URL(value);
    if (!["http:", "https:"].includes(u.protocol)) return;
  } catch {
    return;
  }
  previewTimer = setTimeout(loadPreview, 500);
};
$("#editor-dialog").addEventListener("close", cancelPreview);
async function loadPreview() {
  cancelPreview();
  const sequence = previewSequence,
    form = $("#editor-form"),
    url = form.elements.url.value;
  if (!url) return;
  previewController = new AbortController();
  const revisions = { ...fieldRevisions };
  $("#preview-status").textContent = "Consultando la tienda…";
  try {
    const p = await api("preview", {
      method: "POST",
      body: { url },
      signal: previewController.signal,
    });
    if (sequence !== previewSequence) return;
    applyCandidate(p, revisions);
    previewVariants = p.variants || [];
    $("#variant-choice-label").hidden = !previewVariants.length;
    $("#variant-choice").replaceChildren(
      new Option("Sin elegir · precio desde", ""),
      ...previewVariants.map(
        (v, i) => new Option(`${v.variant} · ${priceLabel(v)}`, String(i)),
      ),
    );
    $("#variant-choice").onchange = (e) => {
      const selected =
        e.target.value === "" ? p : previewVariants[Number(e.target.value)];
      applyCandidate(selected, { ...fieldRevisions });
    };
  } catch (err) {
    if (sequence === previewSequence)
      $("#preview-status").textContent =
        err.name === "TimeoutError"
          ? "La tienda tardó demasiado. Puedes completar los datos manualmente."
          : err.message;
  }
}
$("#preview").onclick = loadPreview;
$("#discard-import").onclick = () => {
  importCandidate = null;
  showObservation(null);
  $("#discard-import").hidden = true;
  $("#editor-form .form-error").textContent =
    "Completa el precio manual si lo conoces y vuelve a guardar.";
};
$("#editor-form").onsubmit = async (e) => {
  e.preventDefault();
  cancelPreview();
  const form = e.currentTarget,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  const b = Object.fromEntries(new FormData(form));
  b.quantity = Number(b.quantity);
  b.favorite = form.elements.favorite.checked;
  b.img = form.elements.img.value || null;
  const manual = form.elements.manual.checked;
  if (manual)
    b.manual_price_cents =
      b.price === "" ? null : Math.round(Number(b.price) * 100);
  else if (editing?.price_kind === "manual") b.manual_price_cents = null;
  delete b.price;
  delete b.manual;
  if (importCandidate && !editing) b.import_ref = importCandidate.import_ref;
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
    if (results.size) renderSearch();
    // Imported observations already came from the store. Never refetch merely to save them.
    if (!b.import_ref && !manual && !p.checked_at)
      api("refresh", { method: "POST", body: { id: p.id } })
        .then((updated) => {
          replaceItem(updated);
          if (detailId === p.id) openDetail(p.id);
        })
        .catch(() => toast("Guardado. Podrás actualizar el precio más tarde."));
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
    $("#discard-import").hidden = err.status !== 410;
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
let pendingSearch = false;
$("#search-form").onsubmit = (e) => {
  e.preventDefault();
  startSearch();
};
async function startSearch() {
  const status = $("#search-status"),
    q = $("#search-query").value.trim();
  if (q.length < 2 || q.length > 120) {
    status.textContent = "Escribe entre 2 y 120 caracteres para buscar.";
    return;
  }
  if (!isAdmin) {
    status.textContent = "Introduce la clave para iniciar esta búsqueda.";
    pendingSearch = true;
    $("#access").click();
    return;
  }
  if (!stores.length) {
    status.textContent =
      "No se pudo cargar la lista de tiendas. Recarga la página.";
    return;
  }
  searchController?.abort();
  searchController = new AbortController();
  activeSearchQuery = q;
  const signal = searchController.signal,
    generation = ++searchGeneration,
    selected = $("#search-store").value;
  const targets = stores.filter((s) => !selected || s.id === selected);
  results = new Map(
    targets.map((s) => [
      s.id,
      { status: s.search ? "loading" : "unsupported", items: [] },
    ]),
  );
  renderSearch();
  await runStores(
    targets.filter((s) => s.search),
    (s) => searchOne(s, q, generation, signal),
    signal,
  );
}
async function searchOne(s, q, generation, signal) {
  try {
    const data = await api("search", {
      method: "POST",
      body: { store: s.id, query: q },
      signal,
    });
    if (!Array.isArray(data.items))
      throw new Error("La tienda devolvió una respuesta inválida.");
    if (generation !== searchGeneration) return;
    results.set(s.id, {
      status: "done",
      items: data.items,
      cached: data.cached,
    });
  } catch (err) {
    if (signal.aborted || generation !== searchGeneration) return;
    results.set(s.id, {
      status: "error",
      items: [],
      error:
        err.name === "TimeoutError"
          ? "Tiempo de espera agotado. Reintenta la tienda."
          : err.message,
    });
  }
  if (generation === searchGeneration) renderSearch();
}
function renderSearch() {
  const container = $("#search-results");
  container.replaceChildren();
  const states = [...results.values()],
    loading = states.filter((r) => r.status === "loading").length;
  const count = states.reduce((n, r) => n + r.items.length, 0);
  $("#search-status").textContent = loading
    ? `Buscando «${activeSearchQuery}» · ${loading} tiendas pendientes · ${count} resultados recibidos`
    : `Búsqueda terminada · ${count} resultados. ${states.filter((r) => r.status === "error").length} tiendas con error.`;
  for (const s of stores) {
    if ($("#search-store").value && $("#search-store").value !== s.id) continue;
    const r = results.get(s.id);
    if (!r) {
      if ($("#search-store").value)
        container.textContent =
          "Pulsa Buscar en tiendas para consultar esta tienda.";
      continue;
    }
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
        `<p class="muted">${r.items.length ? "Los filtros ocultan los resultados. Prueba a quitar el precio máximo." : "La tienda no encontró productos para esta búsqueda."}</p>`;
    if (r.status === "error") {
      const retry = document.createElement("button");
      retry.className = "secondary";
      retry.textContent = "Reintentar";
      retry.disabled = loading > 0;
      retry.onclick = () => {
        if (!isAdmin) {
          pendingSearch = true;
          $("#access").click();
          return;
        }
        results.set(s.id, { status: "loading", items: [] });
        renderSearch();
        searchOne(
          s,
          activeSearchQuery,
          searchGeneration,
          searchController.signal,
        );
      };
      section.append(retry);
    }
    container.append(section);
  }
}
for (const id of ["search-store", "search-max", "search-sort"])
  $(`#${id}`).oninput = renderSearch;
async function loadStores() {
  const target = $("#stores-content");
  target.textContent = "Consultando integraciones…";
  try {
    const data = await api("stores");
    target.replaceChildren();
    for (const s of data) {
      const section = document.createElement("section");
      section.className = "store-panel";
      section.innerHTML = `<h3>${esc(s.name)}</h3><p>Búsqueda: ${s.search ? "Automática" : "Externa"} · Enlace: ${s.import_link ? "API / HTML" : "Manual si la web bloquea"}</p><p class="muted">${esc(s.method)}${s.reason ? " · " + esc(s.reason) : ""}</p>${s.health.map((h) => `<p>${h.operation === "search" ? "Buscador" : "Importación"}: ${h.status === "ok" ? "Respondió" : h.status === "partial" ? "Datos parciales" : "Error"} · ${esc(date(h.checked_at))} · ${h.duration_ms} ms${h.error ? " · " + esc(h.error) : ""}</p>`).join("") || '<p class="muted">Aún no hay comprobaciones registradas.</p>'}<button class="secondary">Probar conexión</button><p role="status"></p>`;
      const button = section.querySelector("button");
      button.onclick = async () => {
        button.disabled = true;
        section.querySelector("[role=status]").textContent = "Comprobando…";
        try {
          await api("stores", { method: "POST", body: { store: s.id } });
          await loadStores();
        } catch (e) {
          section.querySelector("[role=status]").textContent = e.message;
          button.textContent = "Reintentar";
        } finally {
          button.disabled = false;
        }
      };
      target.append(section);
    }
  } catch (e) {
    target.textContent = e.message;
  }
}
$("#tab-stores").onclick = () => {
  if (!isAdmin) return;
  tab(false);
  $("#list-view").hidden = true;
  $("#stores-view").hidden = false;
  $("#tab-list").classList.remove("active");
  $("#tab-list").setAttribute("aria-pressed", "false");
  $("#tab-stores").classList.add("active");
  $("#tab-stores").setAttribute("aria-pressed", "true");
  loadStores();
};
async function init() {
  try {
    const [products, session, registry] = await Promise.all([
      api("products"),
      api("session"),
      api("search"),
    ]);
    if (!Array.isArray(products) || !Array.isArray(registry))
      throw new Error("No se pudieron cargar los datos. Recarga la página.");
    items = products;
    stores = registry;
    while ($("#search-store").options.length > 1) $("#search-store").remove(1);
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
