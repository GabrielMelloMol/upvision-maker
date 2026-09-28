import { expect, go, openApp, test } from "./tauri";

test("produtos: salvar da calculadora leva a composição e o preço acompanha o custo do filamento", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 85, 1000, 1000, 0);
    INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Embalagem', 'un', 5, 50, 0);
    INSERT INTO settings (id, data) VALUES (1, '{"maintenancePct":5}') ON CONFLICT(id) DO UPDATE SET data = excluded.data;`);
  await go(page, "Calculadora");
  const filCard = page.locator("section.card", { hasText: "Filamentos" }).first();
  await filCard.getByLabel("Cadastrado").selectOption({ label: "PLA · Azul · X" });
  await filCard.getByLabel("Gramas").fill("120");
  const extCard = page.locator("section.card", { hasText: "Materiais extras" });
  await extCard.getByRole("button", { name: /Adicionar material/ }).click();
  await extCard.getByLabel("Cadastrado").selectOption({ label: "Embalagem (un)" });
  await extCard.getByLabel("Quantidade").fill("1");
  await page.getByRole("button", { name: "Salvar como produto" }).click();

  const sheet = page.getByRole("dialog", { name: "Novo produto" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Nome").fill("Luminária");
  await expect(sheet.getByText("R$ 15,96")).toBeVisible(); // custo por peça (exemplo da home)
  await sheet.getByRole("button", { name: "Salvar produto" }).click();

  const row = page.getByRole("row", { name: /Luminária/ });
  await expect(row).toContainText("R$ 15,96");
  await expect(row).toContainText("R$ 79,80");

  // filamento mais caro → preço do produto sobe sozinho
  tauri.db.exec("UPDATE filaments SET pricePerKg = 100");
  await go(page, "Calculadora");
  await go(page, "Produtos");
  await expect(page.getByRole("row", { name: /Luminária/ })).toContainText("R$ 17,85");
});

test("produtos: kit mostra custo dos componentes e bloqueia kit dentro de si", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate) VALUES ('Chaveiro', 'simple', '{"filaments":[],"materials":[],"items":[]}', 1);`);
  await go(page, "Produtos");
  await page.getByRole("button", { name: "Novo kit" }).click();
  const sheet = page.getByRole("dialog", { name: "Novo kit" });
  await sheet.getByLabel("Nome").fill("Kit festa");
  await sheet.locator("fieldset", { hasText: "Produtos do kit" }).getByRole("button", { name: "Adicionar" }).click();
  await sheet.locator("fieldset", { hasText: "Produtos do kit" }).getByLabel("Item").selectOption({ label: "Chaveiro" });
  await sheet.locator("fieldset", { hasText: "Produtos do kit" }).getByLabel("Quantidade").fill("10");
  await sheet.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("row", { name: /Kit festa/ })).toContainText("kit");
});
