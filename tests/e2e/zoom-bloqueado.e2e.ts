import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/**
 * Zoom da janela bloqueado (Gabriel: desmonta o layout): Ctrl/⌘ + roda, pinça e Ctrl/⌘ + = − 0 não mexem na tela; o jeito de aumentar
 * a letra é Preferências > Aparência > Tamanho do texto, que continua funcionando. Um aviso, uma vez, diz onde.
 */
const HINT = "Para aumentar a letra, use Preferências > Aparência > Tamanho do texto.";

/** Dispara o evento no documento e diz se alguém cancelou o comportamento padrão (o zoom do navegador/WebView). */
const canceled = (page: Page, make: string) =>
  page.evaluate(`(() => { const e = ${make}; document.body.dispatchEvent(e); return e.defaultPrevented; })()`) as Promise<boolean>;
const keydown = (init: string) => `new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ${init} })`;

test("atalhos, roda e pinça de zoom são cancelados; teclas comuns passam", async ({ page }) => {
  await openApp(page);
  for (const init of ['key: "=", ctrlKey: true', 'key: "+", ctrlKey: true, shiftKey: true', 'key: "-", ctrlKey: true', 'key: "0", ctrlKey: true', 'key: "=", metaKey: true', 'key: "-", metaKey: true', 'key: "0", metaKey: true'])
    expect(await canceled(page, keydown(init)), init).toBe(true);
  expect(await canceled(page, `new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -120 })`)).toBe(true); // pinça do trackpad
  expect(await canceled(page, `new WheelEvent("wheel", { bubbles: true, cancelable: true, metaKey: true, deltaY: 120 })`)).toBe(true);
  expect(await canceled(page, `new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 })`)).toBe(false); // rolar a página segue igual
  expect(await canceled(page, keydown('key: "j", ctrlKey: true'))).toBe(false);
  expect(await canceled(page, keydown('key: "=", altKey: true'))).toBe(false);
});

test("aviso aparece uma vez só, com Abrir que leva a Preferências > Aparência", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+Equal");
  const hint = page.getByText(HINT);
  await expect(hint).toBeVisible();
  await page.keyboard.press("Control+Minus");
  await page.keyboard.press("Control+0");
  await expect(hint).toHaveCount(1); // não empilha
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Aparência" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Tamanho do texto" })).toBeVisible();
  // depois de ver o aviso, novas tentativas só cancelam, sem aviso
  await page.keyboard.press("Control+Equal");
  await page.waitForTimeout(500);
  await expect(page.getByText(HINT)).toHaveCount(0);
});

test("Tamanho do texto continua funcionando e é lembrado; ao abrir, o app volta ao zoom das Preferências (100% se não houver)", async ({ page, tauri }) => {
  await openApp(page);
  // abertura: sem Tamanho do texto salvo, pede 100% ao webview (apaga um zoom que ele tenha lembrado de um atalho)
  await expect.poll(() => tauri.zoom).toBe(1);
  await go(page, "Preferências");
  await page.getByRole("button", { name: "Aparência" }).first().click();
  const size = page.getByRole("group", { name: "Tamanho do texto" });
  await size.getByRole("button", { name: "Maior" }).click();
  await expect.poll(() => tauri.zoom).toBe(1.3);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("upvision:zoom"))).toBe("1.3");
  await page.reload();
  await expect.poll(() => tauri.zoom).toBe(1.3); // lembrado
  await page.evaluate(() => localStorage.removeItem("upvision:zoom"));
  await page.reload();
  await expect.poll(() => tauri.zoom).toBe(1); // sem preferência, volta a 100%
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`Aparência com o aviso legível e sem violação de acessibilidade (${scheme}, ${width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await page.keyboard.press("Control+Equal");
      await expect(page.getByText(HINT)).toBeVisible();
      await go(page, "Preferências");
      await page.getByRole("button", { name: "Aparência" }).first().click();
      await expect(page.getByRole("group", { name: "Tamanho do texto" })).toBeVisible();
      // o app não bloqueia o zoom pela meta viewport (é feito por script), então a regra meta-viewport do axe passa sem exceção
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)).toBe(false);
    });
