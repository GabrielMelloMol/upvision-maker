import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("marca-página com nome na lateral (#71)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Marca-página", "Marca-página", { exact: true });
  await idle(page);
  await page.getByRole("button", { name: "Nome na lateral" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Nome");
  await expect(page.getByText(/o nome sai pela lateral/)).toBeVisible();
});
