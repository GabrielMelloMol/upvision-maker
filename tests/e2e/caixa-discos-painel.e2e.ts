import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const PRINTS = process.env.DISCOS_PRINTS;
async function shot(page: Page, name: string) {
  if (!PRINTS) return;
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}.png` });
}
async function open(page: Page, query: string, label: string) {
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(query);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: label, exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test("caixa de discos: tipos, quantidade, tampa de cabeça para baixo e 3MF só com a mesa", async ({ page, tauri }) => {
  await open(page, "discos", "Caixa de discos");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3); // caixa, tampa e nome
  await shot(page, "01-caixa-de-discos");
  await page.getByRole("button", { name: "Montada (não imprime)" }).click();
  await idle(page);
  await shot(page, "02-caixa-de-discos-fechada");
  await page.getByRole("button", { name: "12 DVDs" }).click();
  await idle(page);
  await shot(page, "03-caixa-de-dvds");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

test("painel perfurado: tamanhos prontos, ladrilhos no grande e ganchos", async ({ page }) => {
  await open(page, "painel", "Painel perfurado");
  await shot(page, "04-painel-perfurado");
  await page.getByRole("button", { name: "Grande (ladrilhos)" }).click();
  await idle(page);
  await expect(page.getByText(/sai em \d+ ladrilhos/)).toBeVisible();
  await shot(page, "05-painel-grande-ladrilhos");
  await open(page, "painel", "Ganchos do painel");
  await shot(page, "06-ganchos-j");
  await page.getByRole("button", { name: "Duplo", exact: true }).click();
  await idle(page);
  await shot(page, "07-ganchos-duplos");
});

for (const scheme of ["light", "dark"] as const)
  test(`caixa de discos e painel: sem violação de acessibilidade (axe), tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [q, l] of [["discos", "Caixa de discos"], ["painel", "Painel perfurado"], ["painel", "Ganchos do painel"]] as const) {
      await open(page, q, l);
      const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
      expect(r.violations.map((v) => `${l}: ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
