import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function open(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("docinho pelo peso");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Forma de docinho pelo peso", exact: true }).click();
  await idle(page);
}
const width = async (page: Page) => Number(/([\d.]+) × [\d.]+ × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);

test("docinho pelo peso: mais gramas, forma maior; a conta aparece escrita; densidade e formatos mudam a cavidade", async ({ page }) => {
  await open(page);
  await expect(page.getByText(/cabe 25 g de doce a 1,20 g\/cm³/)).toBeVisible();
  const w25 = await width(page);
  await page.getByLabel(/^Peso do docinho/).fill("50");
  await idle(page);
  await expect(page.getByText(/cabe 50 g/)).toBeVisible();
  expect(await width(page)).toBeGreaterThan(w25 + 10);
  // doce menos denso (ocupa mais) alarga a forma, doce mais denso estreita
  await page.getByLabel(/^Densidade do doce/).fill("1.6");
  await idle(page);
  expect(await width(page)).toBeLessThan(w25 + 30);
  await page.getByRole("button", { name: "Estrela" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  // sugestão pronta
  await page.getByRole("button", { name: "Brigadeiro 18 g" }).click();
  await idle(page);
  await expect(page.getByText(/cabe 18 g/)).toBeVisible();
  await page.getByLabel(/^Texto da marca/).fill("Ana");
  await idle(page);
  // forma de teste
  await page.getByRole("button", { name: "Só a forma de teste (10 cm³)" }).click();
  await idle(page);
  await expect(page.getByText(/densidade = gramas ÷ 10/)).toBeVisible();
});

test("docinho pelo peso: o docinho fantasma não conta na medida do chip", async ({ page }) => {
  await open(page);
  const depth = async () => Number(/× ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const withGhost = await depth();
  await page.getByRole("switch", { name: /docinho pronto/ }).uncheck();
  await idle(page);
  expect(await depth()).toBeCloseTo(withGhost, 1);
});

test("docinho pelo peso: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await open(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
