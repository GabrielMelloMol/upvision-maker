import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const SHAPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" rx="3"/></svg>';

test("tag de pet: oval ondulada, peixe e formato por desenho (#70)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Tag de pet", "Tag de pet", { exact: true });
  await idle(page);
  await page.getByRole("button", { name: "Peixe" }).click();
  await idle(page);
  await expect(hud(page)).toContainText(/^45\.0 ×/, { timeout: 60_000 });
  await page.getByRole("button", { name: "Desenho", exact: true }).click();
  await expect(page.getByText("Envie o desenho do formato da tag.")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "forma.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SHAPE) });
  await idle(page);
  await expect(hud(page)).toContainText(/^45\.0 ×/);
});
