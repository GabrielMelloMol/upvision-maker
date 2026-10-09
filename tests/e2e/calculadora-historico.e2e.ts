import { resolve } from "node:path";
import { expect, go, openApp, test } from "./tauri";

test("histórico: guarda sozinho, Limpar começa outro, Reabrir volta os valores, Excluir (menu ⋯) tira, e entra no banco (#43)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 95);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click();
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf"));
  await page.getByLabel("Nome da peça").fill("Chaveiros da turma");

  const card = page.locator(".card", { hasText: "Últimos cálculos" });
  const rows = card.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Chaveiros da turma");
  await expect(rows.first()).toContainText("5,1 g");

  // continuar editando atualiza o mesmo cálculo; Limpar começa outro
  await page.getByLabel("Nome da peça").fill("Chaveiros da turma B");
  await expect(rows.first()).toContainText("Chaveiros da turma B");
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar" }).click();
  await page.getByLabel("Nome da peça").fill("Vaso");
  await page.getByLabel("Gramas").first().fill("200");
  await page.getByLabel("Preço por kg").first().fill("100");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Vaso");

  if (process.env.SHOTS_DIR) await card.screenshot({ path: `${process.env.SHOTS_DIR}/calc-historico.png` });
  await card.getByRole("button", { name: "Reabrir Chaveiros da turma B" }).click();
  await expect(page.getByLabel("Nome da peça")).toHaveValue("Chaveiros da turma B");
  await expect(page.getByLabel("Gramas").nth(1)).toHaveValue("1,33");
  expect((tauri.db.prepare("SELECT COUNT(*) AS n FROM calc_history").get() as { n: number }).n).toBe(2);

  await card.getByRole("button", { name: "Ações de Vaso" }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await go(page, "Calculadora");
  await expect(page.locator(".card", { hasText: "Últimos cálculos" }).locator("tbody tr")).toHaveCount(1);
});
