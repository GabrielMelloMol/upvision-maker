import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("suporte de celular dobrável: variação do suporte, folga das dobradiças, travas e prévia montada (#195)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("celular");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Suporte de celular e tablet", exact: true }).click();
  await idle(page);
  // é uma variação do suporte: o fixo e o dobrável ficam lado a lado
  await page.getByRole("button", { name: "Dobrável", exact: true }).click();
  await idle(page);
  await expect(page.getByRole("status").filter({ hasText: /dobre e abra cada dobradiça/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status").filter({ hasText: /Travas: apoio a 45°, 55°, 65°/ })).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Escora");

  // a folga fica entre 0,3 e 0,5 mm (o campo não aceita fora disso)
  const clearance = page.getByLabel(/^Folga das dobradiças/);
  await expect(clearance).toHaveAttribute("min", "0.3");
  await expect(clearance).toHaveAttribute("max", "0.5");
  await clearance.fill("0.5");
  await idle(page);
  await expect(page.getByRole("status").filter({ hasText: /dobre e abra cada dobradiça/ })).toBeVisible();

  // o ângulo muda as travas
  await page.getByLabel(/^Ângulo do meio/).fill("50");
  await idle(page);
  await expect(page.getByRole("status").filter({ hasText: /Travas: apoio a 40°, 50°, 60°/ })).toBeVisible();

  // nome em relevo na base: peça à parte
  await page.getByLabel(/^Nome \(na base\)/).fill("Ana");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Texto");

  // prévia montada: só para ver, com o aviso
  await page.getByRole("group", { name: "Disposição" }).getByRole("button", { name: "Montado" }).click();
  await idle(page);
  await expect(page.getByText(/só a prévia do suporte montado/)).toBeVisible();
  await page.getByRole("group", { name: "Disposição" }).getByRole("button", { name: "Para imprimir" }).click();
  await idle(page);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

/** A tela do dobrável (campos novos, seletor de 3 opções, avisos) em claro e escuro, janela larga e a mais estreita do app (900 px). */
for (const scheme of ["light", "dark"] as const) {
  for (const size of [{ name: "larga", width: 1280, height: 800 }, { name: "estreita", width: 900, height: 600 }]) {
    test.describe(`${scheme} · ${size.name}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });

      test("a tela do suporte dobrável não transborda e passa no axe, com contraste", async ({ page }) => {
        await openApp(page);
        await go(page, "Modelos prontos");
        await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("celular");
        await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Suporte de celular e tablet", exact: true }).click();
        await page.getByRole("button", { name: "Dobrável", exact: true }).click();
        await idle(page);
        await expect(page.getByLabel(/^Folga das dobradiças/)).toBeVisible();
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/dobravel-${scheme}-${size.name}.png`, fullPage: true });
        const sideScroll = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1);
        expect(sideScroll, "a página rola para o lado").toBe(false);
        // o seletor de disposição cabe na linha: nenhum botão cortado
        const seg = page.getByRole("group", { name: "Disposição" });
        const cut = await seg.evaluate((el) => [...el.querySelectorAll<HTMLElement>("button")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
        expect(cut, "botões do seletor com texto cortado").toEqual([]);
        const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "violações do axe").toEqual([]);
      });
    });
  }
}
