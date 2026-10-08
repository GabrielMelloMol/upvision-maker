import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("estampa de camisa: camada fina de 0,3 mm, instruções na tela, fundo contínuo e 3MF (#187)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Estampa de camisa");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Estampa de camisa", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("× 0.3 mm");
  await expect(page.getByText(/A estampa sai espelhada/)).toBeVisible();
  await expect(page.getByText(/ferro de passar sem vapor/)).toBeVisible();
  await page.getByLabel(/^Número de camadas/).fill("4");
  await page.getByLabel(/^Altura de camada/).fill("0.1");
  await idle(page);
  await expect(hud(page)).toContainText("× 0.4 mm");
  await page.getByRole("switch", { name: /Fundo contínuo/ }).check();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Fundo");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
