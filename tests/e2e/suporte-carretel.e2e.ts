import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
test("suporte de carretel: as medidas do carretel mudam a base; eixo e base saem separados", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("suporte de carretel");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Suporte de carretel", exact: true }).click();
  await idle(page);
  await expect(page.locator(".viewer .legend")).toContainText("Eixo");
  const depth = async () => Number(/× ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "")![1]);
  const d200 = await depth();
  await page.getByLabel(/^Diâmetro do carretel/).fill("140");
  await idle(page);
  expect(await depth()).toBeLessThan(d200);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  await expect(page.getByText(/Eixo oco inteiro: ≈ \d+ g de PLA/)).toBeVisible();
  await page.getByRole("button", { name: "Em 2 partes que rosqueiam" }).click();
  await idle(page);
  await expect(page.getByText(/em 2 partes que rosqueiam/)).toBeVisible();
  await expect(page.locator(".viewer .legend")).toContainText("Eixo (parte 2)");
  await page.getByLabel(/^Folga do eixo no furo/).fill("0.5");
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});
