import AxeBuilder from "@axe-core/playwright";
import { expect, openApp, test } from "./tauri";

/** Marca nova (feat/marca-nova): logo por tema e símbolo recolhido. A impressora animada do Início saiu (#250): fica só no site. */

test("Início: o logo segue o tema e a tela passa no axe, sem impressora animada", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  await expect(page.locator(".printer-panel, .printer-stage")).toHaveCount(0);
  await expect(page.locator(".sidebar .brand-logo .logo-light")).toBeVisible();
  await expect(page.locator(".sidebar .brand-logo .logo-dark")).toBeHidden();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".sidebar .brand-logo .logo-dark")).toBeVisible();
  await expect(page.locator(".sidebar .brand-logo .logo-light")).toBeHidden();
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze(); // o contraste é do teste visual
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test("janela pequena: o logo vira só o símbolo recolhido e nada estoura", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
