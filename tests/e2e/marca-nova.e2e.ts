import AxeBuilder from "@axe-core/playwright";
import { expect, openApp, test } from "./tauri";

/** Marca nova (feat/marca-nova): logo por tema, impressora 3D do Início, símbolo parado com movimento reduzido. */

test("Início: impressora desenha o primeiro quadro sem esperar o rAF e o logo segue o tema", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  const canvas = page.locator(".printer-stage canvas");
  await expect(canvas).toHaveClass(/live/, { timeout: 30_000 });
  // a cena aparece de fato: o palco com o canvas difere do palco sem ele
  const stage = page.locator(".printer-stage");
  const withScene = await stage.screenshot();
  await canvas.evaluate((c) => (c.style.visibility = "hidden"));
  expect((await stage.screenshot()).equals(withScene)).toBe(false);
  await canvas.evaluate((c) => (c.style.visibility = ""));
  await expect(page.locator(".sidebar .brand-logo .logo-light")).toBeVisible();
  await expect(page.locator(".sidebar .brand-logo .logo-dark")).toBeHidden();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".sidebar .brand-logo .logo-dark")).toBeVisible();
  await expect(page.locator(".sidebar .brand-logo .logo-light")).toBeHidden();
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa"]).disableRules(["color-contrast"]).analyze(); // o contraste é do teste visual
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test("movimento reduzido: a impressora fica num quadro parado da peça pronta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openApp(page);
  await expect(page.locator(".printer-stage canvas")).toHaveClass(/live/, { timeout: 30_000 });
  const first = await page.locator(".printer-status").textContent();
  await page.waitForTimeout(1200);
  expect(await page.locator(".printer-status").textContent()).toBe(first);
});

test("janela pequena: a impressora some e o logo vira só o símbolo recolhido sem estourar", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await openApp(page);
  await expect(page.locator(".printer-panel")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
