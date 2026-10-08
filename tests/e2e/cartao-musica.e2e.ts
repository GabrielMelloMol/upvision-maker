import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("cartão de música: placa com player, letra em mais linhas deixa a placa mais alta, ímã e 3MF (#112)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Cartão de música");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Cartão de música", exact: true }).click();
  await idle(page);
  for (const name of ["Placa", "Texto", "Destaque"]) await expect(page.locator(".legend")).toContainText(name);
  const depth = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[1]);
  await expect.poll(depth, { timeout: 60_000 }).toBeGreaterThan(50);
  const before = await depth();
  await page.getByLabel(/^Letra, linha 3/).fill("e a terceira linha");
  await page.getByLabel(/^Letra, linha 4/).fill("e a quarta");
  await idle(page);
  await expect.poll(depth).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Ímã atrás" }).click();
  await expect(page.getByText(/Encaixe um ímã de 10 mm/)).toBeVisible();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
