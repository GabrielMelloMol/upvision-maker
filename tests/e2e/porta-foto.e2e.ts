import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("porta-foto: tamanho da foto muda a base; texto sai em outra cor (#74)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Porta-foto");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Porta-foto com texto", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText(/^170\.0 ×/, { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByRole("button", { name: "Polaroid" }).click();
  await idle(page);
  await expect(hud(page)).toContainText(/^108\.0 ×/);
});
