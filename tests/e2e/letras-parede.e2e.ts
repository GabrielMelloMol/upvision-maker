import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("letras para parede: camadas, divisão com pino e gabarito (#57)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "parede", "Letras para parede", { exact: true });
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Camada 2", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Gabarito");
  await expect(page.getByText(/saíram em partes/)).toBeVisible();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Camada 3");
});
