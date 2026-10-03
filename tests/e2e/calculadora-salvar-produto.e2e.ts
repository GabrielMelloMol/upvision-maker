import { expect, go, openApp, test } from "./tauri";

// Auditoria de UX (C1): quem começa precifica com o filamento digitado (sem cadastro). Antes, "Salvar como produto"
// gravava o produto com custo e preço R$ 0,00; agora a calculadora oferece cadastrar o que foi digitado.
test("calculadora → salvar como produto com filamento digitado guarda o custo e o preço (C1)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByLabel("Nome da peça").fill("Chaveiro coração");
  await page.getByLabel("Preço por kg").first().fill("120");
  await page.getByLabel("Gramas").first().fill("12");
  await page.getByLabel(/Tempo de impressão/).fill("1h30");
  await page.getByLabel("Vou vender por").fill("9,90");
  await page.getByRole("button", { name: "Salvar como produto" }).click();

  const ask = page.getByRole("dialog", { name: "Cadastrar o que você digitou?" });
  await expect(ask.getByRole("list", { name: "Itens que serão cadastrados" })).toContainText("Filamento de R$ 120,00/kg (12 g nesta peça)");
  await ask.getByRole("button", { name: "Cadastrar e salvar" }).click();

  const sheet = page.getByRole("dialog", { name: "Novo produto" });
  await expect(sheet.getByLabel("Nome")).toHaveValue("Chaveiro coração");
  await sheet.getByRole("button", { name: "Salvar produto" }).click();
  const row = page.getByRole("row", { name: /Chaveiro coração/ });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("R$ 0,00");
  await expect(row).toContainText("R$ 9,90"); // o "Vou vender por" virou o preço

  const [fil] = tauri.db.prepare("SELECT pricePerKg, stockG, minG FROM filaments").all() as { pricePerKg: number; stockG: number; minG: number }[];
  expect(fil).toEqual({ pricePerKg: 120, stockG: 0, minG: 0 });
  const [prod] = tauri.db.prepare("SELECT composition, manualPrice FROM products").all() as { composition: string; manualPrice: number }[];
  expect(JSON.parse(prod.composition).filaments).toHaveLength(1);
  expect(prod.manualPrice).toBe(9.9);
});

test("calculadora → salvar sem cadastrar avisa o que ficou de fora (C1)", async ({ page }) => {
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByLabel("Preço por kg").first().fill("120");
  await page.getByLabel("Gramas").first().fill("12");
  await page.getByRole("button", { name: "Salvar como produto" }).click();
  await page.getByRole("dialog", { name: "Cadastrar o que você digitou?" }).getByRole("button", { name: "Salvar sem eles" }).click();
  await expect(page.locator(".toast", { hasText: "1 linha(s) sem item cadastrado ficaram de fora do produto." })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Novo produto" })).toBeVisible();
});
