import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("letreiro em camadas: linhas coloridas, enfeite e base contornada; 3MF por cor (#48)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Letreiro");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letreiro em camadas", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Linha 2");

  await page.getByLabel("Texto").nth(2).fill("da Ana");
  await page.getByRole("button", { name: "Coração" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Linha 3");
  await expect(page.locator(".legend")).toContainText("Enfeite");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
