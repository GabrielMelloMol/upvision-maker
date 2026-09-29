import { expect, go, openApp, test, toastWith } from "./tauri";

test("produtos → planilha de upload em massa (#78): selecionar, prévia e salvar .xlsx", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, sku, stock, description, ncm) VALUES ('Chaveiro de coração', 'simple', '{"filaments":[{"filamentId":1,"grams":20}],"materials":[],"items":[]}', 1, 'CH-1', 5, 'Chaveiro impresso em 3D', '39264000');`);
  await go(page, "Produtos");
  await page.getByRole("checkbox", { name: "Selecionar Chaveiro de coração" }).check();
  await page.getByRole("button", { name: "Exportar para marketplace" }).click();
  const sheet = page.getByRole("dialog", { name: "Exportar para marketplace" });
  await expect(sheet).toContainText("1 produto · faltando: categoria (1)");
  await sheet.getByLabel(/^Categoria/).fill("101152");
  await expect(sheet).toContainText("tudo preenchido");
  await sheet.getByRole("button", { name: "Mercado Livre" }).click();
  await expect(sheet.getByLabel("Preço do canal")).toHaveValue("Mercado Livre (clássico)");
  await sheet.getByRole("button", { name: "Salvar planilha" }).click();
  await expect(toastWith(page, "Planilha salva em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /ml-upload-em-massa-.*\.xlsx$/.test(p))).toBe(true);
});
