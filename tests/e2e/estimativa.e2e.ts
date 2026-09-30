import { expect, go, openApp, test, toastWith } from "./tauri";

test("estimativa sem fatiar no modelo 3D e 'Levar para a Calculadora' preenche gramas e tempo (#99)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Branco', 'Voolt', 120, 1000, 1000, 0)");
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Chaveiro giratório");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro giratório", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });

  const est = page.getByRole("group", { name: "Estimativa sem fatiar" });
  await expect(est).toContainText(/≈ [\d,]+ g · ≈ \d/);
  await expect(est).toContainText("±20%");
  const grams = Number((/≈ ([\d,]+) g/.exec(await est.innerText())![1]).replace(",", "."));
  expect(grams).toBeGreaterThan(0.5);
  expect(grams).toBeLessThan(100);

  await est.getByRole("button", { name: "Levar para a Calculadora" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Calculadora");
  await expect(toastWith(page, "Estimativa trazida")).toBeVisible();
  const first = Number((await page.getByLabel("Gramas").nth(0).inputValue()).replace(",", "."));
  expect(first).toBeGreaterThan(0);
  await expect(page.getByLabel("Tempo de impressão")).not.toHaveValue("");
  await expect(page.getByLabel("Nome da peça")).not.toHaveValue("");
});
