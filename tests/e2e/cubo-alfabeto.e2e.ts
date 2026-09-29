import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("cubo alfabeto: 6 faces com desenho rente e kit de nome (#52)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Cubo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Cubo alfabeto", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("40.0 × 40.0 × 40.0 mm", { timeout: 60_000 });
  await expect(page.getByText(/menores de 3 anos/)).toBeVisible();
  await page.getByLabel(/^Kit de nome/).fill("ANA");
  await idle(page);
  await expect(hud(page)).toContainText("136.0 × 40.0 × 40.0 mm");
});
