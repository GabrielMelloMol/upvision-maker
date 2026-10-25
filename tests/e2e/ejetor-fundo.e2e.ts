import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const HEART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

test("ejetor: fundo com borda arredondada ou domo, com dica de camada fina (#62)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Ejetor", "Ejetor de brigadeiro", { exact: true });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "redondo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(HEART) });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.getByText(/0,08 a 0,12 mm/)).toHaveCount(0);

  await page.getByRole("button", { name: "Borda arredondada" }).click();
  await idle(page);
  await expect(page.getByText(/0,08 a 0,12 mm/)).toBeVisible();

  await page.getByRole("button", { name: "Domo" }).click();
  await page.getByLabel(/^Altura do domo/).fill("5");
  await idle(page);
  await expect(page.getByText(/0,08 a 0,12 mm/)).toBeVisible();
  await expect(page.getByText(/ponta fina/)).toHaveCount(0);
});

test("ejetor: fundo por escala até um ponto, com dica de forma simples (#252)", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "Ejetor", "Ejetor de brigadeiro", { exact: true });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "redondo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(HEART) });
  await idle(page);
  await page.getByRole("button", { name: "Escala até um ponto" }).click();
  await expect(page.getByText(/encolhe até o centro/)).toBeVisible();
  await idle(page);
  await expect(page.getByText(/0,08 a 0,12 mm/)).toBeVisible();
  await expect(page.locator(".viewer .overlay")).toHaveCount(0);
});
