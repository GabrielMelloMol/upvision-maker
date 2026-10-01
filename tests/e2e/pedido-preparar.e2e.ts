import { expect, go, openApp, test, toastWith } from "./tauri";

test("do pedido ao arquivo: nomes do item viram o lote do modelo e o pedido vai para produção (#164)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice, modelId) VALUES ('Carimbo com nome', 'simple', '{"filaments":[{"filamentId":1,"grams":10}],"materials":[],"items":[]}', 1, 0, 20, 'stamp');`);

  await go(page, "Pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo pedido" });
  await sheet.getByLabel("Nome do cliente").fill("Escola Sol");
  await sheet.getByRole("button", { name: "Adicionar item" }).click();
  await sheet.getByLabel("Produto").selectOption({ label: "Carimbo com nome" });
  await sheet.getByRole("button", { name: "Personalizar (nomes, textos)" }).click();
  await sheet.getByLabel("Personalização de Carimbo com nome").fill("Ana\nBia\nCaio");
  await expect(sheet.getByText("3 cópias: Ana, Bia, Caio")).toBeVisible();
  await sheet.getByRole("button", { name: "Usar 3 como quantidade" }).click();
  await expect(sheet.getByLabel("Qtd")).toHaveValue("3");
  await sheet.getByRole("button", { name: /Criar pedido|Salvar/ }).click();
  await expect(sheet).toBeHidden();
  expect(tauri.db.prepare("SELECT custom, qty FROM order_items").get()).toEqual({ custom: "Ana\nBia\nCaio", qty: 3 });

  await page.getByRole("button", { name: /Abrir pedido #1/ }).click();
  const detail = page.getByRole("dialog", { name: /Pedido #1/ });
  await expect(detail.getByText("Ana, Bia, Caio")).toBeVisible();
  await detail.getByRole("button", { name: "Preparar impressão" }).click();

  await expect(toastWith(page, "Pedido #1: Em produção.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Modelos prontos");
  await expect(page.getByRole("heading", { level: 2, name: "Carimbo" })).toBeVisible(); // o modelo do produto aberto
  await expect(page.getByRole("switch", { name: /Lote/ })).toBeChecked();
  await expect(page.getByLabel(/Cópias \(uma por linha\)/)).toHaveValue("Ana\nBia\nCaio");
  expect((tauri.db.prepare("SELECT status FROM orders").get() as { status: string }).status).toBe("production");
});
