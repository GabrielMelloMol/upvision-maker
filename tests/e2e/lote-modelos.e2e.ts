import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("lote nos modelos prontos: tags de pet, uma por linha, na mesma mesa (#76)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Tag de pet");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Tag de pet", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  const one = parseFloat((await hud(page).textContent()) ?? "0");
  await page.getByRole("switch", { name: /Lote/ }).check();
  await page.getByLabel(/^Cópias/).fill("Thor; 11 91234-5678\nLuna; 11 98765-4321\nBob; 21 99999-0000; Me leve para casa");
  await expect(page.getByText(/3 cópias/)).toBeVisible();
  await idle(page);
  await expect.poll(async () => parseFloat((await hud(page).textContent()) ?? "0")).toBeGreaterThan(one * 1.5);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /lote\.3mf$/.test(p))).toBe(true);
});
