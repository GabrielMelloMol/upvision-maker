import { expect, openApp, test } from "./tauri";

test("Liquid Glass (#139): refração só nas sheets e na busca no Chromium, não na barra de cima", async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.dataset.glass)).toBe("refract");
  await page.keyboard.press("Control+k");
  const palette = page.locator("dialog.palette");
  await expect(palette).toBeVisible();
  expect(await palette.evaluate((e) => getComputedStyle(e).backdropFilter)).toMatch(/url\("#lg-refract"\).*blur/);
  await page.keyboard.press("Escape");
  const toolbar = page.locator(".toolbar");
  expect(await toolbar.evaluate((e) => getComputedStyle(e).backdropFilter)).not.toMatch(/url/); // a barra de cima não refrata
});

test.describe("com reduzir movimento", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("vidro simples: sem brilho que se mexe e sem refração", async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => document.documentElement.dataset.glass)).toBe("lite");
    await page.keyboard.press("Control+k");
    expect(await page.locator("dialog.palette").evaluate((e) => getComputedStyle(e).backdropFilter)).not.toMatch(/url/);
  });
});
