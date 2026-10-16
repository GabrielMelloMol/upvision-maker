import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("porta-foto: tamanho da foto muda a base; texto sai em outra cor (#74)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Porta-foto", "Porta-foto com texto", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText(/^170\.0 ×/, { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByRole("button", { name: "Polaroid" }).click();
  await idle(page);
  await expect(hud(page)).toContainText(/^108\.0 ×/);
});
