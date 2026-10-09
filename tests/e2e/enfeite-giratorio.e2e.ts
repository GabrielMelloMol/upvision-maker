import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#22a04b"/><circle cx="10" cy="10" r="4" fill="#d6262e"/></svg>';

test("enfeite giratório: texto curvo, enfeites no aro, arte colorida do disco e coleção Natal (#107)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("giratório");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Enfeite giratório", exact: true }).click();
  await idle(page);
  // aro de 60 mm + olhal do gancho em cima; 3 cores (aro, disco, texto)
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await expect(page.getByText(/face da arte para baixo/)).toBeVisible();

  // sinos no aro e outra quantidade
  await page.getByRole("group", { name: "Enfeite do aro" }).getByRole("button", { name: "Sinos" }).click();
  await idle(page);
  await page.getByLabel("Quantidade").fill("6");
  await idle(page);
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);

  // arte colorida no disco: 4 cores (aro, disco e as 2 da arte)
  await page.locator('input[type="file"]').first().setInputFiles({ name: "arte.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ART) });
  await idle(page);
  await expect(page.locator(".viewer .legend span")).toHaveCount(4);

  // entra na coleção Natal
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("");
  await page.getByRole("group", { name: "Ocasião" }).getByRole("button", { name: "Natal" }).click();
  await expect(page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Enfeite giratório", exact: true })).toBeVisible();
});
