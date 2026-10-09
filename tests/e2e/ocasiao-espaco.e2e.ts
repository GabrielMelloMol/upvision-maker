import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/** Cartão da ocasião ("Para o Dia das Crianças, faltam 3 dias") com espaço do que vem antes e depois, na Início e na Criar. */
const gap = (page: Page, above: string, below: string) =>
  page.evaluate(([a, b]) => document.querySelector(b)!.getBoundingClientRect().top - document.querySelector(a)!.getBoundingClientRect().bottom, [above, below]);

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`cartão da ocasião não cola nos vizinhos (${scheme}, ${width}px)`, async ({ page }) => {
      await page.clock.install({ time: new Date("2026-10-09T10:00:00-03:00") }); // faltam 3 dias para o Dia das Crianças
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await go(page, "Início");
      const card = page.locator(".home > .occasion-card");
      await expect(card).toContainText("Para o Dia das Crianças");
      await expect(card).toContainText("faltam 3 dias");
      // mesmo ritmo das seções da Início: 32 px (--space-8) acima; o bloco de baixo mantém a folga dele
      expect(await gap(page, ".home-actions", ".home > .occasion-card")).toBeGreaterThanOrEqual(31); // 32 px, com folga de subpixel
      const next = await page.evaluate(() => {
        const el = document.querySelector(".home > .occasion-card")!.nextElementSibling;
        return el ? el.getBoundingClientRect().top - document.querySelector(".home > .occasion-card")!.getBoundingClientRect().bottom : 99;
      });
      expect(next).toBeGreaterThanOrEqual(12);
      const axeHome = await new AxeBuilder({ page }).include(".home > .occasion-card").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axeHome.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

      await go(page, "Criar");
      await expect(page.locator(".create > .occasion-card")).toContainText("faltam 3 dias");
      expect(await gap(page, ".create > h1", ".create > .occasion-card")).toBeGreaterThanOrEqual(12);
      expect(await gap(page, ".create > .occasion-card", ".create-filters")).toBeGreaterThanOrEqual(12);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)).toBe(false);
    });
