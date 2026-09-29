import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("letras para parede: camadas, divisão com pino e gabarito (#57)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("parede");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letras para parede", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Camada 2", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Gabarito");
  await expect(page.getByText(/saíram em partes/)).toBeVisible();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Camada 3");
});
