import { readWorkbook } from "../../src/domain/marketplace/xlsx";
import { expect, go, openApp, test, toastWith } from "./tauri";

test("variações por cor (#82): custo da cor, estoque somado, nome repetido e uma linha por cor na planilha", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0), ('PLA', 'Dourado', 'Silk', 300, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, sku, stock, description, ncm) VALUES ('Chaveiro de coração', 'simple', '{"filaments":[{"filamentId":1,"grams":20}],"materials":[],"items":[]}', 1, 'CH-1', 0, 'Chaveiro impresso em 3D', '39264000');`);
  await go(page, "Produtos");
  await page.getByRole("button", { name: "Editar Chaveiro de coração" }).click();
  const sheet = page.getByRole("dialog", { name: /Chaveiro de coração/ });
  const variants = sheet.locator("fieldset.variants");
  await expect(variants.getByLabel("Filamento que muda de cor")).toHaveValue("1");

  await variants.getByRole("button", { name: "Adicionar variação" }).click();
  await variants.getByLabel("Variação 1", { exact: true }).fill("Azul");
  await variants.getByLabel("SKU da variação 1").fill("CH-AZ");
  await variants.getByLabel("Estoque da variação 1").fill("2");
  await variants.getByRole("button", { name: "Adicionar variação" }).click();
  await variants.getByLabel("Variação 2", { exact: true }).fill("Dourado");
  await variants.getByLabel("Filamento da variação 2").selectOption({ label: "PLA · Dourado · Silk" });
  await variants.getByLabel("SKU da variação 2").fill("CH-DO");
  await variants.getByLabel("Estoque da variação 2").fill("1");

  const cost = (i: number) => variants.locator(".variant-cost").nth(i);
  await expect(cost(0)).toContainText("R$");
  expect(await cost(1).textContent()).not.toBe(await cost(0).textContent()); // filamento dourado custa mais
  await expect(sheet.getByLabel("Estoque pronto (un)")).toHaveValue("3");

  await variants.getByLabel("Variação 2", { exact: true }).fill("azul");
  await sheet.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(sheet).toContainText("Variação repetida: azul.");
  await variants.getByLabel("Variação 2", { exact: true }).fill("Dourado");
  await sheet.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("row", { name: /Chaveiro de coração/ })).toContainText("3");

  await page.getByRole("checkbox", { name: "Selecionar Chaveiro de coração" }).check();
  await page.getByRole("button", { name: "Exportar para marketplace" }).click();
  const exp = page.getByRole("dialog", { name: "Exportar para marketplace" });
  await expect(exp).toContainText("1 produto em 2 linhas (uma por variação)");
  await exp.getByLabel(/^Categoria/).fill("101152");
  tauri.nextOpen = "/pasta"; // planilha e fotos vão para a pasta escolhida (A12)
  await exp.getByRole("button", { name: "Salvar planilha" }).click();
  await expect(toastWith(page, "Planilha salva em")).toBeVisible();
  const [, bytes] = [...tauri.files].find(([p]) => /shopee-upload-em-massa-.*\.xlsx$/.test(p))!;
  const [{ rows }] = readWorkbook(new Uint8Array(bytes));
  const col = (name: string) => rows.slice(1).map((r) => r[rows[0].indexOf(name)]);
  expect(col("Opção para Variação 1")).toEqual(["Azul", "Dourado"]);
  expect(col("Nome da Variação 1")).toEqual(["Cor", "Cor"]);
  expect(new Set(col("Número de Integração de Variação")).size).toBe(1);
});
