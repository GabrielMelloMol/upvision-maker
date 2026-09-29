import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

// Modelos de cozinha e casa da fila da Lupa (#63, #65, #66, #73, #59, #64, #75).
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function openModel(page: Page, name: string) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
}

async function save3mf(page: Page, files: Map<string, unknown>) {
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
}

test("cortador em grade (#63): prévia com cortador e texto, aviso da mesa e 3MF", async ({ page, tauri }) => {
  await openModel(page, "Cortador em grade");
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByLabel(/^Colunas/).fill("12");
  await idle(page);
  await expect(page.getByText(/passa da mesa de 256 mm/)).toBeVisible();
  await page.getByLabel(/^Colunas/).fill("4");
  await idle(page);
  await save3mf(page, tauri.files);
});
