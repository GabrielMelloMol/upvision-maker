import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("letra caixa LED: face rente com difusor, estilos e divisão acima de 256 mm (#49)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("LED");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letra caixa LED", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Difusor");

  await page.getByRole("button", { name: "Tampa elevada" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tampa");

  await page.getByLabel(/^Altura \(mm\)/).fill("400");
  await idle(page);
  await expect(page.getByText(/a caixa saiu em \d+ partes/)).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
