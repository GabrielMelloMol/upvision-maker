import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

async function pick(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Gridfinity");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
}

test("Gridfinity: caixinha com etiqueta e base dividida pela mesa (#93)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "Gridfinity: caixinha");
  await expect(hud(page)).toContainText("83.5 ×", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Etiqueta");
  await pick(page, "Gridfinity: base");
  await expect(hud(page)).toContainText("168.0 × 126.0", { timeout: 90_000 });
  await page.getByLabel(/^Largura \(casas\)/).fill("8");
  await page.getByLabel(/^Profundidade \(casas\)/).fill("7");
  await idle(page);
  await expect(page.getByText(/saiu em 4 pedaços/)).toBeVisible();
});
