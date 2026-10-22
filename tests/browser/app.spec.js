import { test, expect } from "@playwright/test";
async function login(page) {
  await page.getByRole("button", { name: "Administrar", exact: true }).click();
  await page
    .getByLabel("Clave de administrador")
    .fill("test-password-not-for-production");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar administración" }),
  ).toBeVisible();
}
test("public view blocks mutations and external consumption", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByText("Sofá de prueba", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Añadir enlace" }),
  ).toBeHidden();
  const headers = { Origin: "http://127.0.0.1:3100" };
  for (const path of ["products", "search", "refresh", "comments", "preview"]) {
    const r = await request.post(`/api/${path}`, { headers, data: {} });
    expect(r.status()).toBe(401);
  }
  expect((await request.get("/api/cron")).status()).toBe(401);
  await page
    .getByRole("button", { name: "Descubrir productos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar para buscar" }),
  ).toBeEnabled();
});
test("admin saves, edits, favorites, comments, history, purchases and logout persist", async ({
  page,
}, testInfo) => {
  const name = `Mesa ${testInfo.project.name}`,
    url = `https://example.com/${testInfo.project.name}`;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await login(page);
  await page.getByRole("button", { name: "+ Añadir enlace" }).click();
  const form = page.locator("#editor-form");
  await form.getByLabel("Enlace del producto").fill(url);
  await form.getByLabel("Nombre", { exact: true }).fill(name);
  await form.getByLabel("Habitación", { exact: true }).fill("Comedor");
  await form.getByLabel("Introducir o corregir precio manualmente").check();
  await form.getByLabel("Precio por producto o pack (€)").fill("123.45");
  await form.getByLabel("Cantidad").fill("2");
  await form.getByLabel("Estado", { exact: true }).selectOption("chosen");
  await form.getByRole("button", { name: "Guardar producto" }).click();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toContainText("123,45");
  await card.getByRole("button", { name: "Marcar favorito" }).click();
  await expect(
    card.getByRole("button", { name: "Quitar favorito" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Detalles" }).click();
  await expect(page.locator("#history-content")).toContainText("123,45");
  await page
    .getByLabel("Nuevo comentario")
    .fill("Medir el espacio antes de comprar.");
  await page.getByRole("button", { name: "Añadir comentario" }).click();
  await expect(page.locator("#comments-content")).toContainText(
    "Medir el espacio",
  );
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await form.getByLabel("Estado", { exact: true }).selectOption("purchased");
  await form.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.locator("#detail")).toContainText("Comprado");
  await page
    .locator("#detail-dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await page.reload();
  await expect(card).toContainText("Comprado");
  await expect(
    card.getByRole("button", { name: "Quitar favorito" }),
  ).toBeVisible();
  await page.screenshot({
    path: `work/${testInfo.project.name}-list.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cerrar administración" }).click();
  await expect(
    page.getByRole("button", { name: "+ Añadir enlace" }),
  ).toBeHidden();
  await page.reload();
  await expect(card).toContainText("123,45");
  expect(errors).toEqual([]);
});
test("search delivers partial results, isolates failures and ignores old queries", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await page.route("**/api/search", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    const { store, query } = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, store === "northdeco" ? 50 : 600));
    if (store === "sklum")
      return route.fulfill({
        status: 502,
        json: { error: "Tienda no disponible" },
      });
    await route.fulfill({
      json: {
        items: [
          {
            name: `${query} ${store}`,
            store,
            price_cents: 1000,
            price_kind: "from",
            url: `https://example.com/${store}`,
            currency: "EUR",
          },
        ],
      },
    });
  });
  await page
    .getByRole("button", { name: "Descubrir productos", exact: true })
    .click();
  await page.getByLabel("¿Qué estás buscando?").fill("mesa");
  await page.getByRole("button", { name: "Buscar en tiendas" }).click();
  await expect(
    page.getByRole("heading", { name: "mesa northdeco", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".group-status").filter({ hasText: "Buscando" }).first(),
  ).toBeVisible();
  await page.getByLabel("¿Qué estás buscando?").fill("silla");
  await page.getByRole("button", { name: "Buscar en tiendas" }).click();
  await expect(
    page.getByRole("heading", { name: "silla nooma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "mesa nooma", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Tienda no disponible", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Búsqueda externa", { exact: true })).toHaveCount(
    5,
  );
});
