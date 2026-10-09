import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("ímã de geladeira: bolsos para 1 a 5 ímãs com pausa, aviso quando não cabem e 3MF (#186)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Ímã de geladeira");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Ímã de geladeira", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Corpo");
  await expect(page.getByText(/Pausa em Z = 0,\d+ mm|Pausa em Z = \d+,\d+ mm/)).toBeVisible();
  await expect(page.getByText(/coloque o ímã no bolso/)).toBeVisible();
  await page.getByLabel(/^Quantidade de ímãs/).fill("3");
  await idle(page);
  await expect(page.getByText(/coloque os 3 ímãs nos bolsos/)).toBeVisible();
  await page.getByLabel(/^Quantidade de ímãs/).fill("5");
  await page.getByLabel(/^Diâmetro do ímã/).fill("14");
  await idle(page);
  await expect(page.getByText(/Só (cabe 1 ímã|cabem \d ímãs) de 14 mm/)).toBeVisible();
  await page.getByLabel(/^Quantidade de ímãs/).fill("1");
  await page.getByLabel(/^Diâmetro do ímã/).fill("10");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
