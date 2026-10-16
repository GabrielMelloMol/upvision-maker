import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function open(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("aromatizador");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro aromatizador", exact: true }).click();
  await idle(page);
}
async function width(page: Page): Promise<number> {
  const m = /([\d.]+) × ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return Number(m![1]);
}

test("aromatizador: cápsula com logo em texto, corpo e tampa, teste da rosca menor e Salvar 3MF", async ({ page }) => {
  await open(page);
  await expect(page.locator(".viewer .legend")).toContainText("Corpo");
  await expect(page.locator(".viewer .legend")).toContainText("Logo");
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  const full = await width(page);
  await page.getByLabel(/^Texto do logo/).fill("Rosa");
  await idle(page);
  await page.getByLabel(/^Diâmetro do feltro/).fill("40");
  await idle(page);
  expect(await width(page)).toBeGreaterThan(full + 10);
  await page.getByRole("button", { name: "Só o teste da rosca" }).click();
  await idle(page);
  expect(await width(page)).toBeLessThan(full);
  await page.getByLabel(/^Folga da rosca/).fill("0.15");
  await expect(page.getByText(/Folga pequena/)).toBeVisible();
});

test("aromatizador: formatos, sugestões prontas, estrias, montado ao lado e rótulo de quantidade de furos", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel(/^Quantidade de furos/)).toBeVisible();
  const width = async () => Number(/([\d.]+) × [\d.]+ × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const height = async () => Number(/× ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const onTable = await width();
  const tall = await height();
  // montada só aparece na outra vista: não fica junto das peças da mesa
  await page.getByRole("button", { name: "Montada (não imprime)" }).click();
  await expect(page.getByText(/Ela não vai para o arquivo/)).toBeVisible();
  await idle(page);
  expect(await width()).toBeLessThan(onTable);
  await page.getByRole("button", { name: "Mesa (o que imprime)" }).click();
  expect(await width()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Gota", exact: true }).click();
  await idle(page);
  expect(await height()).toBeGreaterThan(tall + 5); // a gota é mais alta que o redondo
  await page.getByRole("button", { name: "Dia das Mães (coração)" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Coração", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^Texto do logo/)).toHaveValue("Mãe");
  await page.getByRole("switch", { name: /Estrias/ }).uncheck();
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});

test("aromatizador: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await open(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
