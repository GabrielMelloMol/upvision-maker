import { mkdirSync } from "node:fs";
import { expect, openApp, settleColors, test } from "./tauri";

// Prints da #250: SHOTS_DIR=pasta SHOT_TAG=antes|depois. Criar, Início e busca, no claro e no escuro.
const DIR = process.env.SHOTS_DIR;
const TAG = process.env.SHOT_TAG ?? "depois";
for (const scheme of ["light", "dark"] as const)
  test(`prints ${TAG} (${scheme})`, async ({ page }) => {
    test.skip(!DIR, "só com SHOTS_DIR");
    mkdirSync(DIR!, { recursive: true });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openApp(page);
    await settleColors(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/${TAG}-inicio-${scheme}.png` });
    await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Criar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Criar", level: 1 })).toBeVisible();
    await settleColors(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/${TAG}-criar-${scheme}.png` });
    await page.getByRole("searchbox").first().fill("pix");
    await settleColors(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/${TAG}-busca-pix-${scheme}.png` });
  });
