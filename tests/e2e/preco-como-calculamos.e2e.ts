import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { expect, go, openApp, test } from "./tauri";

// "Como calculamos o preço" (#216): abre pela Calculadora, mostra os 10 passos com número e passa no axe (claro/escuro, 1280 e 640 px).
// SHOTS_DIR=pasta grava os prints.
const SHOTS = process.env.SHOTS_DIR;

test("Calculadora → Como calculamos o preço → volta à Calculadora", async ({ page }) => {
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByText("Qual preço usar?").click();
  await page.getByRole("complementary").getByRole("button", { name: "Como calculamos o preço" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Como calculamos o preço" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Passo a passo da conta" }).getByRole("listitem")).toHaveCount(10);
  await expect(page.locator("#ph-filament")).toContainText("72 g");
  await expect(page.getByTestId("pricing-compare")).toContainText("Valor da sua hora");
  await expect(page.locator("#ph-channel")).toContainText("R$ 4,50");
  await page.getByRole("button", { name: "Abrir a Calculadora" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calculadora" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`Como calculamos o preço: acessível e sem estourar a tela (${scheme}, ${width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: SHOTS ? 2800 : 900 });
      await openApp(page);
      await go(page, "Como calculamos o preço");
      await expect(page.locator("#ph-channel")).toBeVisible();
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)).toBe(false);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/como-calculamos-${scheme === "light" ? "claro" : "escuro"}-${width}.png`, fullPage: true });
      }
    });
