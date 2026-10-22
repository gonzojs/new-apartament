import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
const html = await readFile("index.html", "utf8");
const script =
  (await readFile("web/search-queue.js", "utf8")).replaceAll("export ", "") +
  "\n" +
  (await readFile("web/api.js", "utf8")).replaceAll("export ", "") +
  "\n" +
  (await readFile("web/app.js", "utf8")).replace(
    /import[\s\S]*?from\s+["'][^"']+["'];/g,
    "",
  );
const stores = [
  {
    id: "northdeco",
    name: "Northdeco",
    search: true,
    external: "https://northdeco.com/search?q=",
  },
  {
    id: "benuta",
    name: "Benuta",
    search: true,
    external: "https://www.benuta.es/search?q=",
  },
  {
    id: "rugvista",
    name: "Rugvista",
    search: false,
    external: "https://www.rugvista.es/search?query=",
  },
];
const tick = () => new Promise((r) => setTimeout(r, 5));
async function until(fn) {
  for (let i = 0; i < 150; i++) {
    if (fn()) return;
    await tick();
  }
  assert.fail("UI condition not reached");
}
async function setup({ admin = true, handle } = {}) {
  const dom = new JSDOM(html, {
      url: "http://localhost:3100",
      runScripts: "outside-only",
    }),
    w = dom.window;
  const requests = [];
  w.AbortSignal = AbortSignal;
  w.AbortController = AbortController;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new w.Event("close"));
  };
  w.fetch = async (url, opts) => {
    const name = url.replace("/api/", ""),
      body = opts.body ? JSON.parse(opts.body) : undefined;
    requests.push({ name, ...opts, body });
    let value;
    if (handle) value = await handle(name, opts, body);
    if (value === undefined) {
      if (name === "products") value = [];
      else if (name === "session") value = { admin };
      else if (name === "search") value = stores;
      else value = {};
    }
    return new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    });
  };
  vm.runInContext(script, dom.getInternalVMContext());
  await until(
    () => w.document.querySelector("#search-store").options.length === 4,
  );
  const $ = (s) => w.document.querySelector(s);
  const input = (selector, value) => {
    $(selector).value = value;
    $(selector).dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const submit = (s) =>
    $(s).dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
  return { w, $, input, submit, requests, close: () => dom.window.close() };
}
test("public discovery opens login and retains the query; validation is visible", async () => {
  const u = await setup({ admin: false });
  try {
    u.$("#tab-discover").click();
    u.input("#search-query", "m");
    u.submit("#search-form");
    assert.match(u.$("#search-status").textContent, /entre 2 y 120/);
    u.input("#search-query", "mesa");
    u.submit("#search-form");
    assert.equal(u.$("#login-dialog").open, true);
    assert.equal(u.$("#search-query").value, "mesa");
    assert.equal(
      u.requests.filter((r) => r.method === "POST" && r.name === "search")
        .length,
      0,
    );
  } finally {
    u.close();
  }
});
test("selected-store search renders results and saves using server import reference", async () => {
  const p = {
    name: "Alfombra",
    url: "https://www.benuta.es/rug.html",
    img: "https://example.com/rug.jpg",
    store: "Benuta",
    variant: "160 cm",
    price_cents: 12345,
    price_kind: "exact",
    currency: "EUR",
    identity_key: "benuta:size1",
    import_ref: "server-reference",
  };
  let saveBody;
  const u = await setup({
    handle: (name, opts, body) => {
      if (name === "search" && opts.method === "POST") return { items: [p] };
      if (name === "products" && opts.method === "POST") {
        saveBody = body;
        return {
          ...p,
          id: "saved",
          quantity: 1,
          status: "interested",
          favorite: false,
        };
      }
    },
  });
  try {
    u.$("#tab-discover").click();
    u.input("#search-store", "benuta");
    u.input("#search-query", "alfombra");
    u.submit("#search-form");
    await until(() => u.$("#search-results article"));
    assert.deepEqual(
      u.requests
        .filter((r) => r.method === "POST" && r.name === "search")
        .map((r) => r.body.store),
      ["benuta"],
    );
    u.$("#search-results [data-action]").click();
    assert.equal(u.$("#editor-form").elements.name.value, "Alfombra");
    assert.match(u.$("#editor-observation").textContent, /123,45/);
    u.submit("#editor-form");
    await until(() => !!saveBody);
    await until(() => !u.$("#editor-dialog").open);
    assert.equal(saveBody.import_ref, "server-reference");
    assert.equal(saveBody.img, p.img);
    assert.equal(saveBody.manual_price_cents, undefined);
    assert.equal(u.requests.filter((r) => r.name === "refresh").length, 0);
    assert.match(
      u.$("#search-results [data-action]").textContent,
      /Ya guardado/,
    );
  } finally {
    u.close();
  }
});
test("link debounce keeps manual edits and shows partial data and image failures", async () => {
  let complete;
  const u = await setup({
    handle: (name) =>
      name === "preview" ? new Promise((r) => (complete = r)) : undefined,
  });
  try {
    u.$("#add").click();
    u.input("#editor-form [name=url]", "https://example.com/lamp");
    await until(() => !!complete);
    u.input("#editor-form [name=name]", "Mi lámpara");
    complete({
      url: "https://example.com/lamp",
      name: "Nombre tienda",
      img: "https://example.com/lamp.jpg",
      price_cents: null,
      currency: "EUR",
      warnings: ["Precio sin verificar"],
      import_ref: "partial",
    });
    await until(() =>
      u.$("#editor-form").elements.img.value.endsWith("lamp.jpg"),
    );
    assert.equal(u.$("#editor-form").elements.name.value, "Mi lámpara");
    assert.match(
      u.$("#editor-observation").textContent,
      /Precio sin verificar/,
    );
    u.$("#editor-image").dispatchEvent(new u.w.Event("error"));
    assert.equal(u.$("#editor-image-error").hidden, false);
    assert.equal(u.$("#editor-form [type=submit]").disabled, false);
  } finally {
    u.close();
  }
});
test("changing a link ignores a late response from the previous URL", async () => {
  const pending = [];
  const u = await setup({
    handle: (name) =>
      name === "preview"
        ? new Promise((resolve) => pending.push(resolve))
        : undefined,
  });
  try {
    u.$("#add").click();
    u.input("#editor-form [name=url]", "https://example.com/old");
    await until(() => pending.length === 1);
    u.input("#editor-form [name=url]", "https://example.com/new");
    await until(() => pending.length === 2);
    pending[1]({
      url: "https://example.com/new",
      name: "Nuevo",
      img: null,
      price_cents: null,
    });
    await until(() => u.$("#editor-form").elements.name.value === "Nuevo");
    pending[0]({
      url: "https://example.com/old",
      name: "Viejo",
      img: null,
      price_cents: null,
    });
    await tick();
    assert.equal(u.$("#editor-form").elements.name.value, "Nuevo");
  } finally {
    u.close();
  }
});
test("store administration lists capabilities", async () => {
  const u = await setup({
    handle: (name, opts) =>
      name === "stores"
        ? opts.method === "POST"
          ? { error: "Sin acceso" }
          : stores.map((s) => ({ ...s, method: "API", health: [] }))
        : undefined,
  });
  try {
    u.$("#tab-stores").click();
    await until(
      () => u.$("#stores-content").querySelectorAll("section").length === 3,
    );
    assert.equal(u.$("#stores-view").hidden, false);
    assert.match(u.$("#stores-content").textContent, /Northdeco/);
    assert.match(u.$("#stores-content").textContent, /Búsqueda: Externa/);
  } finally {
    u.close();
  }
});
