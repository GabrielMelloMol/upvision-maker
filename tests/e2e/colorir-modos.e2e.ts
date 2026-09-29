import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="9" height="10"/><rect x="11" width="9" height="10"/></svg>';

test("plaquinha de colorir: rebaixado, 2 peças e marchetaria (#61)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("colorir");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Plaquinha de colorir", exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "arte.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ART) });
  await idle(page);
  await page.getByRole("button", { name: "2 peças" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Grade");
  await page.getByRole("button", { name: "Marchetaria" }).click();
  await idle(page);
  await expect(page.getByText(/Marchetaria: imprima cada peça/)).toBeVisible();
  await page.getByRole("button", { name: "Rebaixado" }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");
});
