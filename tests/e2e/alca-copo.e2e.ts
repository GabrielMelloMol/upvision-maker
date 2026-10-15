import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function open(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("alça de copo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Alça de copo térmico", exact: true }).click();
  await idle(page);
}
const size = async (page: Page): Promise<[number, number, number]> => {
  const m = /([\d.]+) × ([\d.]+) × ([\d.]+) mm/.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

test("alça de copo: perfis prontos mudam as medidas, o anel de teste é pequeno e dá para salvar", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  const [w40, , h40] = await size(page);
  await page.getByRole("button", { name: "Copo 500 ml cônico (aprox.)" }).click();
  await idle(page);
  const [w5, , h5] = await size(page);
  expect(w5).toBeLessThan(w40 - 10);
  expect(h5).toBeLessThan(h40 - 20);
  await expect(page.getByLabel(/^Diâmetro da base do copo/)).toHaveValue("62");
  await page.getByRole("button", { name: "Só o anel de teste" }).click();
  await idle(page);
  const [wt, , ht] = await size(page);
  expect(ht).toBeLessThan(20);
  expect(wt).toBeLessThan(w5);
  await expect(page.getByText(/parar rente à marca/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  // a luva que passa do topo do copo avisa
  await page.getByRole("button", { name: "Alça inteira" }).click();
  await page.getByLabel(/^Onde a luva começa/).fill("150");
  await idle(page);
  await expect(page.getByText(/passa do topo/)).toBeVisible();
});

test("alça de copo: nome em relevo de outra cor por padrão, luva vazada e com faixas, copo fantasma não conta na medida", async ({ page }) => {
  await open(page);
  await expect(page.locator(".viewer .legend")).toContainText("Nome"); // outra cor: o nome não some no preto
  const h = async () => Number(/× ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const withCup = await h();
  await page.getByRole("switch", { name: /copo fantasma/ }).uncheck();
  await idle(page);
  expect(await h()).toBeCloseTo(withCup, 1); // o fantasma é só para ver
  await page.getByRole("button", { name: "Vazada" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  await page.getByRole("button", { name: "Com faixas" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});

test("alça de copo: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await open(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
