import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("tecla de teclado: legenda em 2 cores, ícone Lucide, largura em u, folga da haste e lote (#115)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Tecla de teclado");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Tecla de teclado", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tecla");
  await expect(page.locator(".legend")).toContainText("Legenda");
  await expect(hud(page)).toContainText("18.0 × 18.0 × 8.0 mm");
  await expect(page.getByText(/Haste MX com folga de 0,15 mm/)).toBeVisible();
  await page.getByLabel(/^Folga da cruz da haste/).fill("0.25");
  await idle(page);
  await expect(page.getByText(/Haste MX com folga de 0,25 mm/)).toBeVisible();
  await page.getByLabel(/^Largura \(u\)/).fill("2.25");
  await idle(page);
  await expect(hud(page)).toContainText("41.8 × 18.0 × 8.0 mm");
  await expect(page.getByText(/a haste do meio sai aqui/)).toBeVisible();
  await page.getByLabel(/^Largura \(u\)/).fill("1");
  // ícone Lucide no lugar da letra: o desenho vence e a legenda continua embutida
  await page.getByRole("button", { name: "Ícone Enter" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Legenda");
  await expect(hud(page)).toContainText("18.0 × 18.0 × 8.0 mm");
  // lote: uma tecla por linha na mesma mesa
  await page.getByRole("button", { name: "Remover desenho" }).click();
  await page.getByRole("switch", { name: /Lote/ }).check();
  await page.getByLabel(/^Cópias/).fill("Q\nW\nE\nR\nT");
  await expect(page.getByText(/5 cópias/)).toBeVisible();
  await idle(page);
  await expect.poll(async () => parseFloat((await hud(page).textContent()) ?? "0"), { timeout: 60_000 }).toBeGreaterThan(40);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /lote\.3mf$/.test(p))).toBe(true);
});
