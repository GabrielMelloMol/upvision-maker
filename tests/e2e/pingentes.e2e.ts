import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("pingentes de nomes: um por item, com ícone, em 3 cores (#72)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Pingentes", "Pingentes de nomes", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Ícone");
  const before = await hud(page).textContent();
  await page.getByLabel(/^Nomes e ícones/).fill("Ana; pata, Bia; coração, Caio; estrela, Duda; nenhum, Eva; pata");
  await idle(page);
  await expect(hud(page)).not.toHaveText(before ?? "");
});
