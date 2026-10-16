import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("string art: fios impressos em 3 cores e tábua para pregos (#58)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "String", "String art", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Fios");
  await page.getByRole("button", { name: "Tábua para pregos" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tábua");
  await expect(page.getByText(/\d+ furos para prego/)).toBeVisible();
});
