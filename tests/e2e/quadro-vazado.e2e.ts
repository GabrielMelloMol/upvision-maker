import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function pick(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
}

test("quadro vazado 18 × 25 cm com lados presos e placa vazada em pé com base (#191)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "Quadro vazado");
  await expect(hud(page)).toContainText("180.0 × 250.0 × 3.0 mm");
  await expect(page.locator(".legend")).toContainText("Moldura");
  await expect(page.locator(".legend")).toContainText("Desenho");
  await page.getByRole("switch", { name: "Preso em cima" }).uncheck();
  await page.getByRole("switch", { name: "Preso embaixo" }).uncheck();
  await idle(page);
  await expect(page.getByText(/Nenhum lado preso/)).toBeVisible();
  await page.getByRole("switch", { name: "Preso à esquerda" }).check();
  await idle(page);
  await expect(page.getByText(/Nenhum lado preso/)).toHaveCount(0);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();

  await pick(page, "Placa vazada em pé");
  await expect(page.locator(".legend")).toContainText("Placa");
  await page.getByLabel(/^Texto vazado/).fill("OBA");
  await idle(page);
  await expect(page.getByText(/miolo\(s\) do desenho/)).toBeVisible(); // o centro do O e do B cairia
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
