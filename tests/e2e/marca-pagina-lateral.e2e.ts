import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("marca-página com nome na lateral (#71)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Marca-página");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Marca-página", exact: true }).click();
  await idle(page);
  await page.getByRole("button", { name: "Nome na lateral" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Nome");
  await expect(page.getByText(/o nome sai pela lateral/)).toBeVisible();
});
