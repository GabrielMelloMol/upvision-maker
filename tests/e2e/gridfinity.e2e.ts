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

test("Gridfinity pela gaveta: 500 × 420 × 80 vira 11 × 9 casas em 6 pedaços; teste de encaixe (#140)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "Gridfinity: base pela gaveta");
  await expect(page.getByText(/Cabem 11 × 9 casas.*até 10 unidades.*6 pedaço/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Encostar no canto" }).click();
  await idle(page);
  await expect(page.getByText(/margem 0 \| 37 mm na largura/)).toBeVisible();
  await pick(page, "Gridfinity: teste de encaixe");
  await expect(page.getByRole("button", { name: /STL caixinha de teste/ })).toBeVisible();
});
