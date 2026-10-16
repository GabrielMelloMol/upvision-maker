import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("vaso paramétrico: perfil por pontos, estrela com torção e modo vaso no 3MF (#92)", async ({ page, tauri }) => {
  await openApp(page);
  await pickModel(page, "Vaso", "Vaso paramétrico", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("150.0 mm", { timeout: 90_000 });
  const before = await hud(page).textContent();
  // setas no ponto do meio abrem o vaso
  const p3 = page.getByRole("slider", { name: "Ponto 3 (de baixo para cima)" });
  await p3.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await idle(page);
  await expect(hud(page)).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Estrela" }).click();
  await page.getByLabel(/^Torção/).fill("90");
  await idle(page);
  await expect(page.getByText(/modo espiral ligado/)).toBeVisible();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((f) => f.endsWith(".3mf"))).toBe(true);
});
