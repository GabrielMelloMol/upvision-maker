import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function pick(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
}

test("abridor com bolso NFC e fenda posicionável; chaveiro NFC em estrela (#69)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "Chaveiro abridor");
  await page.getByRole("button", { name: "Lata" }).click();
  await page.getByLabel(/^Fenda: posição \(↑\)/).fill("12");
  await idle(page);
  await expect(page.getByText(/encosta na borda/)).toBeVisible();
  await page.getByRole("switch", { name: /Bolso para tag NFC/ }).check();
  await idle(page);
  await expect(page.getByText(/coloque a tag NFC/)).toBeVisible();
  await pick(page, "Chaveiro NFC");
  await page.getByRole("button", { name: "Estrela" }).click();
  await page.getByLabel(/^Tamanho/).fill("55");
  await idle(page);
  await expect(page.getByText(/Pausa em Z/)).toBeVisible();
});
