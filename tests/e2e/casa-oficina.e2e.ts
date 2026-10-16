import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function pick(page: Page, search: string, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(search);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
}
const size = async (page: Page): Promise<[number, number, number]> => {
  const m = /([\d.]+) × ([\d.]+) × ([\d.]+) mm/.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

test("tampa de ralo: o diâmetro do ralo e o tipo mudam a peça; sugestão pronta; Salvar 3MF", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "tampa de ralo", "Tampa de ralo");
  const [w50, , h50] = await size(page);
  expect(w50).toBeCloseTo(66, 0); // 50 + 2 × 8 de aba
  await page.getByRole("button", { name: "Ralo de chuveiro 100 mm" }).click();
  await idle(page);
  const [w100, , hCover] = await size(page);
  expect(w100).toBeGreaterThan(w50 + 40);
  expect(hCover).toBeLessThan(h50); // sem pino é mais baixa
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  await page.getByLabel(/^Folga do pino/).fill("0.1");
  await page.getByRole("button", { name: "Com pino" }).click();
  await idle(page);
  await expect(page.getByText(/Folga pequena/)).toBeVisible();
});

test("funil, O-ring e retentor: sugestões prontas mudam as medidas e avisam do que não prometem", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "funil", "Funil");
  const [wf] = await size(page);
  await page.getByRole("button", { name: "Tinta e solvente" }).click();
  await idle(page);
  expect((await size(page))[0]).toBeGreaterThan(wf + 40);
  await pick(page, "o-ring", "O-ring");
  await page.getByRole("button", { name: "50 × 4 mm" }).click();
  await idle(page);
  await expect(page.getByText(/não garante vedação/)).toBeVisible();
  await pick(page, "retentor", "Retentor");
  await page.getByRole("button", { name: "Eixo 25 × 40 × 7" }).click();
  await idle(page);
  expect((await size(page))[0]).toBeCloseTo(40.4, 0);
  await expect(page.getByText(/não segura pressão/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});

test("casa e oficina: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "tampa de ralo", "Tampa de ralo");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
