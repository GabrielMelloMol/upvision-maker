import { expect, openApp, test } from "./tauri";

const styles = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const bg = (sel: string) => getComputedStyle(document.querySelector(sel)!).backgroundColor;
    return {
      vibrancy: document.documentElement.dataset.vibrancy ?? null,
      html: bg("html"),
      body: bg("body"),
      main: bg("main"),
      sidebarBlur: getComputedStyle(document.querySelector(".sidebar")!).backdropFilter,
    };
  });

const TRANSPARENT = "rgba(0, 0, 0, 0)";

for (const scheme of ["light", "dark"] as const) {
  test(`Mica ativa (${scheme}): janela transparente, conteúdo opaco e legível`, async ({ page, tauri }) => {
    tauri.windowStyle = { effect: "mica", overlayTitlebar: false };
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("data-vibrancy", "mica");
    const s = await styles(page);
    expect(s.html).toBe(TRANSPARENT);
    expect(s.body).toBe(TRANSPARENT);
    expect(s.main).not.toBe(TRANSPARENT); // texto do conteúdo sempre sobre fundo sólido
    expect(s.sidebarBlur).toBe("none");
    await page.screenshot({ path: `docs/screenshots/depois/janela-mica-${scheme}.png` });
  });

  test(`fallback Windows 10 (${scheme}): sem material, tudo opaco`, async ({ page, tauri }) => {
    tauri.windowStyle = { effect: "none", overlayTitlebar: false };
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    const s = await styles(page);
    expect(s.vibrancy).toBeNull();
    expect(s.html).not.toBe(TRANSPARENT);
    expect(s.body).not.toBe(TRANSPARENT);
    expect(s.main).not.toBe(TRANSPARENT);
  });
}

test("Reduzir transparência do sistema: mesmo com Mica, a sidebar fica sólida", async ({ page, tauri }) => {
  tauri.windowStyle = { effect: "mica", overlayTitlebar: false };
  await openApp(page);
  // Playwright não emula prefers-reduced-transparency: confere a regra no CSS carregado.
  const hasRule = await page.evaluate(() =>
    [...document.styleSheets].some((sh) => [...sh.cssRules].some((r) => r.cssText.includes("prefers-reduced-transparency") && r.cssText.includes("data-vibrancy"))),
  );
  expect(hasRule).toBe(true);
});

test("macOS: barra de título sobreposta abre espaço para os semáforos", async ({ page, tauri }) => {
  tauri.windowStyle = { effect: "sidebar", overlayTitlebar: true };
  await openApp(page);
  await expect(page.locator(".sidebar .drag")).toHaveCSS("height", "30px");
  await expect(page.locator(".toolbar")).toHaveAttribute("data-tauri-drag-region");
});
