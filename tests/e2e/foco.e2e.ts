import type { Locator } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/** Anel de foco de quem usa o teclado: contorno de verdade (não some quando o botão zera a sombra). */
const ring = (el: Locator) => el.evaluate((e) => ({ style: getComputedStyle(e).outlineStyle, width: parseFloat(getComputedStyle(e).outlineWidth), visible: e.matches(":focus-visible") }));

test("foco visível em botão fantasma, link, chip e botão de ícone (#142)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.keyboard.press("Tab"); // daqui em diante o foco é "de teclado"
  const targets = [
    page.getByRole("button", { name: /^Favoritar|^Tirar .* dos favoritos/ }), // .icon-button
    page.getByRole("group", { name: "Ocasião" }).getByRole("button").first(), // .chips
    page.getByRole("button", { name: "Ajuda: Modelos prontos" }), // .ghost.icon-only
    page.getByRole("button", { name: "Buscar", exact: false }).first(), // .ghost da barra de cima
  ];
  for (const el of targets) {
    await el.focus();
    const r = await ring(el);
    expect(r.visible, await el.evaluate((e) => e.outerHTML.slice(0, 80))).toBe(true);
    expect(r.style, await el.evaluate((e) => e.outerHTML.slice(0, 80))).not.toBe("none");
    expect(r.width).toBeGreaterThanOrEqual(2);
  }
  await go(page, "Calculadora");
  await page.keyboard.press("Tab");
  const link = page.getByRole("button", { name: "Limpar" }); // .link
  await link.focus();
  expect((await ring(link)).style).not.toBe("none");
});
