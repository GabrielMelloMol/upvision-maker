import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const variant = (page: Page, name: string) => page.getByRole("group", { name: "Variação" }).getByRole("button", { name, exact: true });

test("Peças mecânicas: engrenagem com par, planetário, polia, roda dentada e corrente (#230)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("engrenagem");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Engrenagem (e o par engrenado)", exact: true }).click();
  await idle(page);
  await expect(page.getByText(/distância entre os eixos 56,00 mm, redução 1,80 : 1/)).toBeVisible({ timeout: 90_000 });
  await expect(hud(page)).toContainText("×");

  await page.getByLabel(/^Dentes da segunda/).fill("40");
  await idle(page);
  await expect(page.getByText(/redução 2,00 : 1/)).toBeVisible();

  await variant(page, "Planetário").click();
  await idle(page);
  await expect(page.getByText(/Redutor 4,00 : 1/)).toBeVisible({ timeout: 90_000 });
  await page.getByLabel(/^Dentes de cada planeta/).fill("18");
  await idle(page);
  await expect(page.getByText(/Redutor 5,00 : 1/)).toBeVisible({ timeout: 90_000 });

  await variant(page, "Polia").click();
  await idle(page);
  await expect(page.getByText(/diâmetro primitivo 12,73 mm/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "HTD 3M (passo 3 mm)" }).click();
  await idle(page);
  await expect(page.getByText(/HTD 3M/).first()).toBeVisible();

  await variant(page, "Roda dentada").click();
  await idle(page);
  await expect(page.getByText(/passo 9,525 mm/)).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "ANSI 25 (passo 6,35)" }).click();
  await idle(page);
  await expect(page.getByText(/passo 6,350 mm/)).toBeVisible();

  await variant(page, "Corrente").click();
  await idle(page);
  await expect(hud(page)).toContainText("×", { timeout: 90_000 });
  await page.getByLabel(/^Folga entre os elos/).fill("0.2");
  await page.getByLabel("Elos", { exact: true }).fill("30");
  await idle(page);
  await expect(page.getByText(/passa da mesa/)).toBeVisible();
});
