import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const PRINTS = process.env.TROFEU_PRINTS;
async function shot(page: Page, name: string) {
  if (!PRINTS) return;
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}.png` });
}
async function open(page: Page, label: string) {
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("troféu");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: label, exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test("troféu atleta: esportes prontos, troca de esporte e 3MF", async ({ page, tauri }) => {
  await open(page, "Troféu atleta");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3); // atleta, base e texto da base
  await shot(page, "01-atleta-futebol");
  await page.getByRole("button", { name: "Natação" }).click();
  await idle(page);
  await shot(page, "02-atleta-natacao");
  await page.getByRole("button", { name: "Prata" }).click();
  await idle(page);
  await shot(page, "03-atleta-prata");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

test("troféu escultura: fita, estrela e cruz torcidas", async ({ page }) => {
  await open(page, "Troféu escultura");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await shot(page, "04-escultura-fita");
  await page.getByRole("button", { name: "Estrela prateada" }).click();
  await idle(page);
  await shot(page, "05-escultura-estrela");
  await page.getByRole("button", { name: "Cruz bronze" }).click();
  await idle(page);
  await shot(page, "06-escultura-cruz");
});

test("troféu: a família mostra as variações Atleta e Escultura", async ({ page }) => {
  await open(page, "Troféu atleta");
  await expect(page.getByRole("button", { name: "Escultura", exact: true }).first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`troféu escultura: sem violação de acessibilidade (axe), tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const l of ["Troféu atleta", "Troféu escultura"] as const) {
      await open(page, l);
      const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
      expect(r.violations.map((v) => `${l}: ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
