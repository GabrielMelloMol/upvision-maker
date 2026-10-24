import type { Page } from "@playwright/test";
import { expect, openApp, pickModel as pickModelBy, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function pickModel(page: Page, name: string) {
  await pickModelBy(page, name, name, { exact: true });
}

test("letra grande: nome encaixado vira 2 peças, material vira 3, aviso acima de 256 mm (#55)", async ({ page, tauri }) => {
  await openApp(page);
  await pickModel(page, "Letra grande");
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Nome");

  await page.getByRole("button", { name: "Fundo para EVA/feltro" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Moldura");

  await page.getByLabel(/^Altura da letra/).fill("270");
  await idle(page);
  await expect(page.getByText(/passa da mesa de 256 mm/)).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
