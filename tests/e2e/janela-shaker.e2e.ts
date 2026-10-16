import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("peça com janela: pausa do glitter/acetato no 3MF e tecido (#56)", async ({ page, tauri }) => {
  await openApp(page);
  await pickModel(page, "janela", "Peça com janela (shaker)", { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.getByText(/coloque o glitter/)).toBeVisible();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
  await page.getByRole("button", { name: "Tecido (tule)" }).click();
  await idle(page);
  await expect(page.getByText(/estique o tecido/)).toBeVisible();
});
