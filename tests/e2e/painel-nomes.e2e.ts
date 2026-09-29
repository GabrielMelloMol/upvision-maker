import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("painel de nomes: grade automática e divisão acima da mesa (#54)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Painel");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Painel de nomes", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("200.0 × 140.0", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Nomes");
  await page.getByLabel(/^Largura/).fill("400");
  await idle(page);
  await expect(page.getByText(/saiu em 2 partes/)).toBeVisible();
});
