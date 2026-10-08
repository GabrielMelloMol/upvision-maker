import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("abajur de mesa: cúpula e base montadas, aviso de LED, pronta para imprimir e 3MF (#111)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Abajur");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Abajur de mesa", exact: true }).click();
  await idle(page);
  await expect(page.getByText(/Use só lâmpada LED/)).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Cúpula");
  await expect(page.locator(".legend")).toContainText("Base");
  const width = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[0]);
  await expect.poll(width, { timeout: 60_000 }).toBeGreaterThan(140);
  const assembled = await width();
  await page.getByRole("button", { name: "Pronta para imprimir" }).click();
  await idle(page);
  await expect.poll(width).toBeGreaterThan(assembled + 100); // cúpula ao lado da base
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
