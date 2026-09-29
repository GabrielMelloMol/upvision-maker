import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("pingentes de nomes: um por item, com ícone, em 3 cores (#72)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Pingentes");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Pingentes de nomes", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Ícone");
  const before = await hud(page).textContent();
  await page.getByLabel(/^Nomes e ícones/).fill("Ana; pata, Bia; coração, Caio; estrela, Duda; nenhum, Eva; pata");
  await idle(page);
  await expect(hud(page)).not.toHaveText(before ?? "");
});
