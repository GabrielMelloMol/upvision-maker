import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("chaveiro suporte de celular: abridor de lata + fenda inclinada na medida do aparelho, avisos e 3MF (#192)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Chaveiro suporte de celular");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro suporte de celular", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Arte");
  await expect(page.getByText(/inclinado 65° para o lado da argola/)).toBeVisible();
  const hud = page.locator(".viewer .hud");
  await expect(hud).toContainText("× 13.0 mm"); // 12 de placa + 1 de relevo
  await page.getByLabel(/^Inclinação do aparelho/).fill("70");
  await idle(page);
  await expect(page.getByText(/inclinado 70° para o lado da argola/)).toBeVisible();
  await page.getByLabel(/^Inclinação do aparelho/).fill("55");
  await page.getByLabel(/^Espessura da placa/).fill("9");
  await idle(page);
  await expect(page.getByText(/aumente a espessura da placa para/)).toBeVisible();
  await page.getByLabel(/^Espessura da placa/).fill("12");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
