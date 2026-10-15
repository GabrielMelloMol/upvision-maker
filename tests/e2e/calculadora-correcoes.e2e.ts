import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, go, openApp, prefsSection, test, toastWith } from "./tauri";

/** Com CALC_PRINTS=<pasta>, guarda os prints "depois" (só da página do app). */
const PRINTS = process.env.CALC_PRINTS;
async function shot(page: Page, name: string, scrollTo?: Locator) {
  if (!PRINTS) return;
  await scrollTo?.scrollIntoViewIfNeeded(); // a página rola dentro do app: traz o que se quer mostrar para a janela
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}.png` });
}
const full = (page: Page) => page.evaluate(() => localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} })));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
});

test("C1 e C2: Shopee e Mercado Livre com faixas de preço e a data da regra; custo de R$ 40 sugere R$ 107,15", async ({ page }) => {
  await openApp(page);
  await full(page);
  await go(page, "Calculadora");
  // material de R$ 40 sem falha: 40 g a R$ 1.000/kg
  await page.getByLabel("Preço por kg").fill("1000");
  await page.getByLabel("Gramas").fill("40");
  await page.getByLabel("Tempo de impressão").fill("0");
  const table = page.getByRole("table").filter({ hasText: "Taxas e impostos" });
  await expect(table).toBeVisible();
  const shopee = table.getByRole("row", { name: /^Shopee/ });
  await expect(shopee).toContainText("Taxas por faixa de preço, conferidas em 15/10/2026");
  await expect(table.getByRole("row", { name: /^Mercado Livre \(clássico\)/ })).toContainText("frete obrigatório neste preço");
  await shot(page, "01-depois-preco-por-canal-faixas", table);
  // as faixas e a nota da regra, em Preferências
  await go(page, "Preferências");
  await prefsSection(page, "Canais de venda");
  await expect(page.getByLabel("A partir de (faixa 1, Shopee)")).toHaveValue("80,00");
  await expect(page.getByText(/Regra de 01\/10\/2026 lida em fontes secundárias/).first()).toBeVisible();
  await shot(page, "02-depois-preferencias-faixas-por-canal");
});

test("C3: salvar como produto leva a purga e o kWh medido (o produto sai com o mesmo preço da calculadora)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  tauri.db.exec("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Preto', 'Voolt', 120, 1000, 1000, 0)");
  tauri.db.exec("INSERT INTO printers (name, watts, price, lifeHours) VALUES ('A1', 95, 3000, 5000)");
  await full(page);
  await go(page, "Calculadora");
  await page.getByLabel("Filamento").selectOption({ label: "PLA · Preto · Voolt" });
  await page.getByLabel("Impressora").selectOption("A1");
  await page.getByLabel("Gramas").fill("40");
  await page.getByLabel("Tempo de impressão").fill("2h");
  await page.getByLabel("Trocas de cor").fill("60");
  await page.getByLabel("kWh medido desta impressão").fill("0,5");
  await shot(page, "03-depois-calculadora-com-purga");
  await page.getByRole("button", { name: "Salvar como produto" }).click();
  await expect(toastWith(page, "kWh medido foi gravado")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Produtos");
  await expect(page.locator("input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).resolves.toContain("88"); // 40 g + 48 g de purga
  await shot(page, "04-depois-produto-com-purga");
});

test("C4 e C5: 'Levar para a Calculadora' troca as peças na mesa e põe preço nas cores sem filamento, com aviso", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  tauri.db.exec("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Branco', 'Voolt', 120, 1000, 1000, 0)");
  await page.evaluate(() => localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: { quantity: "10" } })));
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Chaveiro giratório");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro giratório", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  const est = page.getByRole("group", { name: "Estimativa sem fatiar" });
  await shot(page, "05-depois-estimativa-ferramenta");
  await est.getByRole("button", { name: "Levar para a Calculadora" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Calculadora");
  await expect(toastWith(page, "Estimativa trazida")).toBeVisible();
  await expect(page.getByLabel("Peças na mesa")).toHaveValue("1");
  await expect(page.getByText("preço estimado: confira").first()).toBeVisible();
  const prices = await page.getByLabel("Preço por kg").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(prices.every((p) => p !== "" && p !== "0,00")).toBe(true);
  await shot(page, "06-depois-calculadora-apos-levar");
});

test("#243: arredondar não cai na faixa pior, margem inválida avisa e o Rápido lista o que o Completo guardou", async ({ page }) => {
  await openApp(page);
  await full(page);
  await go(page, "Calculadora");
  await page.getByLabel("Preço por kg").fill("1000");
  await page.getByLabel("Gramas").fill("32");
  await page.getByLabel("Tempo de impressão").fill("90");
  await expect(page.getByText(/90 horas\? Se eram minutos, escreva 90 min\./)).toBeVisible();
  await page.getByLabel("Margem em marketplace (%)").fill("trinta");
  await page.getByLabel("Margem em marketplace (%)").blur();
  await expect(page.getByText(/Digite a margem, ex\.: 30/)).toBeVisible();
  await shot(page, "07-depois-avisos-de-campo", page.getByLabel("Tempo de impressão"));
  await page.getByLabel("Tempo de impressão").fill("1h");
  await page.getByRole("button", { name: "Rápido" }).click();
  await expect(page.getByText(/Também entram na conta \(modo Completo\)/)).toHaveCount(0); // margem inválida não conta
  await page.getByRole("button", { name: "Completo" }).click();
  await page.getByLabel("Frete absorvido por peça").fill("5");
  await page.getByRole("button", { name: "Rápido" }).click();
  await expect(page.getByText(/frete de R\$\s5,00 por peça/)).toBeVisible();
  await shot(page, "08-depois-rapido-lista-o-que-entra");
});
