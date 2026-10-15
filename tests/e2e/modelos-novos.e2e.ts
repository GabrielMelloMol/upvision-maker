import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const PRINTS = process.env.MODELOS_PRINTS;
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
  await page.emulateMedia({ reducedMotion: "reduce" }); // a câmera não desliza nem gira: o print sai no enquadramento final
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test("chaveiro halter: variações prontas e 3MF", async ({ page, tauri }) => {
  await open(page, "halter", "Chaveiro halter");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3); // anilhas, barra e texto
  await shot(page, "01-halter");
  await page.getByRole("button", { name: "Rosa" }).click();
  await idle(page);
  await shot(page, "02-halter-rosa");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);

});

test("chaveiro kettlebell: variações prontas", async ({ page }) => {
  await open(page, "kettlebell", "Chaveiro kettlebell");
  await expect(page.locator(".viewer .legend span")).toHaveCount(2);
  await shot(page, "03-kettlebell");
  await page.getByRole("button", { name: "24 KG" }).click();
  await idle(page);
  await shot(page, "04-kettlebell-24");
});

test("clipe de papel: cabeça com texto, tamanho pequeno e 3MF", async ({ page }) => {
  await open(page, "clipe", "Clipe de papel");
  await expect(page.locator(".viewer .legend span")).toHaveCount(2);
  await shot(page, "05-clipe-de-papel");
  await page.getByRole("button", { name: "Pequeno" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled();
  await page.getByRole("button", { name: "Mãe", exact: true }).click();
  await idle(page);
  await shot(page, "06-clipe-mae");
});

test("suportes de livro: apoio de polegar e suporte de mesa", async ({ page }) => {
  await open(page, "polegar", "Apoio de polegar para livro");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await shot(page, "07-apoio-de-polegar");
  await page.getByRole("button", { name: "Criança" }).click();
  await idle(page);
  await shot(page, "08-apoio-crianca");

});

test("suporte de livro de mesa: variações prontas e família com as duas variações", async ({ page }) => {
  await open(page, "livro", "Suporte de livro de mesa");
  await expect(page.locator(".viewer .legend span")).toHaveCount(2);
  await shot(page, "09-suporte-de-livro");
  await page.getByRole("button", { name: "Receitas" }).click();
  await idle(page);
  await shot(page, "10-suporte-receitas");
  // a família mostra as duas variações
  await expect(page.getByRole("group", { name: /Variação|Tipo/ }).first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`modelos novos: sem violação de acessibilidade (axe), tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [q, l] of [["halter", "Chaveiro halter"], ["kettlebell", "Chaveiro kettlebell"], ["clipe", "Clipe de papel"], ["polegar", "Apoio de polegar para livro"], ["livro", "Suporte de livro de mesa"]] as const) {
      await open(page, q, l);
      const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
      expect(r.violations.map((v) => `${l}: ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
