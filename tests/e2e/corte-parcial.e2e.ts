import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const STL = resolve("tests/fixtures/stl/personagem-arvore.stl");
const set = (page: Page, label: RegExp, v: number) => page.getByLabel(label).fill(String(v));

test("corte parcial: corta só a cabeça do personagem e deixa a árvore intacta; salva o 3MF com resto, pedaço e pinos", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await expect(page.getByText(/Use só modelos que são seus ou cuja licença permite/)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(STL);
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("×");

  // a caixa começa na peça toda; reduz até pegar só a cabeça do personagem (a árvore fica fora)
  await set(page, /^X de/, -4);
  await set(page, /^X até/, 20);
  await set(page, /^Z de/, 24);
  await set(page, /^Posição do plano/, 31);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Pedaço 1");
  await expect(page.locator(".legend")).toContainText("Região");
  await expect(page.getByText(/Conferido: as duas peças saem fechadas/)).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("personagem-arvore-corte.3mf"))).toBe(true);
});

for (const width of [1280, 720]) {
  test(`corte parcial: tela com o arquivo aberto passa no axe, claro e escuro (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openApp(page);
    await go(page, "Corte parcial");
    await page.locator('input[type="file"]').first().setInputFiles(STL);
    await idle(page);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settleColors(page);
      const axe = await new AxeBuilder({ page }).exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations.filter((v) => !v.nodes.every((n) => n.target.join(" ").includes("hud"))).map((v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
}
