import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function open(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("caixa para placa");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Caixa para placa eletrônica", exact: true }).click();
  await idle(page);
}
const size = async (page: Page): Promise<[number, number, number]> => {
  const m = /([\d.]+) × ([\d.]+) × ([\d.]+) mm/.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

test("caixa para placa: perfis prontos preenchem as medidas, furos e aberturas; linha ruim avisa; bandeja de teste", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/^Comprimento da placa/)).toHaveValue("68.6");
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  const [, , hBox] = await size(page);
  await page.getByRole("button", { name: "Raspberry Pi 4B (aprox.)" }).click();
  await idle(page);
  await expect(page.getByLabel(/^Comprimento da placa/)).toHaveValue("85");
  await expect(page.getByLabel(/^Furos de fixação/)).toHaveValue("3.5, 3.5; 61.5, 3.5; 3.5, 52.5; 61.5, 52.5");
  await page.getByLabel(/^Aberturas/).fill("right, 10.25, 16.5, 14, 0\nlixo");
  await idle(page);
  await expect(page.getByText(/Abertura ignorada/)).toBeVisible();
  await page.getByRole("button", { name: "Só a bandeja de teste" }).click();
  await idle(page);
  expect((await size(page))[2]).toBeLessThan(hBox);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});

test("caixa para placa: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await open(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
