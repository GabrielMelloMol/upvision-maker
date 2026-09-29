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
