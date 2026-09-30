import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("Caixa com tampa: encaixe com texto embutido e deslizante com trilho (#94)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Caixa com tampa");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Caixa com tampa", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("178.0 × 54.0 × 31.5", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByRole("button", { name: "Deslizante", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("× 33.5", { timeout: 90_000 });
  await page.getByLabel(/^Largura/).first().fill("250");
  await page.getByLabel(/^Parede/).fill("4");
  await idle(page);
  await expect(page.getByText(/passa da mesa/)).toBeVisible();
});
