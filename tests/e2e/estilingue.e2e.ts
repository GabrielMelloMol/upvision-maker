import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
test("estilingue: nome, formato e os cuidados escritos na tela", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("estilingue");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Estilingue personalizado", exact: true }).click();
  await idle(page);
  await expect(page.getByText(/Brinquedo e hobby, sem garantia de resistência/)).toBeVisible();
  await expect(page.locator(".viewer .legend")).toContainText("Nome");
  const w = async () => Number(/([\d.]+) × [\d.]+ × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const w70 = await w();
  await page.getByLabel(/^Abertura entre as pontas/).fill("90");
  await idle(page);
  expect(await w()).toBeGreaterThan(w70 + 15);
  await page.getByLabel(/^Largura dos braços/).fill("12");
  await idle(page);
  await expect(page.getByText(/Braço fino/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});
