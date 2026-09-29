import { resolve } from "node:path";
import { expect, go, openApp, test } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("para onde vai o preço: partes somam o preço do canal; trocar o canal mostra as taxas (#38)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 95);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click();
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf"));
  const card = page.locator(".card", { hasText: "Para onde vai o preço" });
  await expect(card).toBeVisible();
  const legend = card.locator(".split-legend li");
  await expect(legend.first()).toContainText("Produção");
  await expect(legend.filter({ hasText: "Lucro" })).toHaveCount(1);
  await expect(legend.filter({ hasText: "Taxas e impostos" })).toHaveCount(0); // venda direta sem taxa (imposto 0)

  // as partes somam o preço escolhido (R$ na legenda)
  const brl = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  const sum = async () => (await card.locator(".split-legend .num:not(.muted)").allInnerTexts()).reduce((t, s) => t + brl(s), 0);
  const chosen = async () => brl((await card.getByLabel("Canal").locator("option:checked").innerText()).split("·").pop()!);
  expect(Math.abs((await sum()) - (await chosen()))).toBeLessThanOrEqual(0.02);

  await card.getByLabel("Canal").selectOption("Shopee");
  await expect(legend.filter({ hasText: "Taxas e impostos" })).toHaveCount(1);
  expect(Math.abs((await sum()) - (await chosen()))).toBeLessThanOrEqual(0.02);
  await expect(card.getByRole("img", { name: /Preço de R\$/ })).toBeVisible();
  if (SHOTS) {
    await card.screenshot({ path: `${SHOTS}/preco-partes-light.png` });
    await page.emulateMedia({ colorScheme: "dark" });
    await card.screenshot({ path: `${SHOTS}/preco-partes-dark.png` });
  }
});

test("por que meu preço é diferente: 4 diferenças com os números da tela (#45)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 95);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click();
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf"));
  await page.getByLabel("Mão de obra").fill("15");
  await page.getByRole("button", { name: /Por que meu preço é diferente/ }).click();
  const sheet = page.getByRole("dialog", { name: "Por que meu preço é diferente?" });
  const items = sheet.locator(".diff-list > li");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText("Falhas");
  await expect(items.nth(1)).toContainText("95 W");
  await expect(items.nth(2)).toContainText("markup de 400 %");
  await expect(items.nth(3)).toContainText("uma vez só");
  await expect(items.nth(1)).toContainText("3,5×");
  await expect(items.nth(0).locator(".diff-values")).toContainText("Aqui R$");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/preco-diferente.png` });
  await sheet.getByRole("button", { name: "Entendi" }).click();
  await expect(sheet).toBeHidden();
});

test("comparar cenários: guarda A, muda a tela (B), mostra a diferença e troca A ↔ B (#44)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 95);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click();
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf"));
  await page.getByLabel("Nome da peça").fill("3 na mesa");
  await page.getByRole("button", { name: /Comparar com outro cenário/ }).click();

  const card = page.getByRole("region", { name: "Comparar cenários" });
  await expect(card.locator("tbody tr").filter({ hasText: "Custo por peça" })).toContainText("igual");
  await page.getByLabel("Nome da peça").fill("1 na mesa");
  await page.getByLabel("Peças na mesa").fill("1");
  const cost = card.locator("tbody tr").filter({ hasText: "Custo por peça" });
  await expect(cost).toContainText("(pior)"); // 1 peça por mesa: custo por peça sobe
  await expect(card.locator("thead")).toContainText("A · 3 na mesa");
  await expect(card.locator("thead")).toContainText("B · 1 na mesa");
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/comparar-cenarios.png` });

  await card.getByRole("button", { name: "Trocar A e B" }).click();
  await expect(page.getByLabel("Peças na mesa")).toHaveValue("3");
  await expect(cost).toContainText("(melhor)");
  await card.getByRole("button", { name: "Fechar comparação" }).click();
  await expect(card).toHaveCount(0);
});
