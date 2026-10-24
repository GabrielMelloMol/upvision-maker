import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("organizador de mesa: fila com nome e grade com drenagem (#51)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Organizador", "Organizador de mesa", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("180.0 × 81.2 × 70.0 mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Nome");
  await page.getByRole("button", { name: "Grade" }).click();
  await page.getByRole("switch", { name: "Furos de drenagem no fundo" }).check();
  await idle(page);
  await expect(page.getByText(/menos de 1 cm/)).toHaveCount(0);
});
