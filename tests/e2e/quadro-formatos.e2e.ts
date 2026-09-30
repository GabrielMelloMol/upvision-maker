import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const hud = (page: Page) => page.locator(".viewer .hud");
async function settled(page: Page): Promise<string> {
  await expect(hud(page)).toContainText("mm", { timeout: 150_000 });
  await expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 150_000 });
  return hud(page).innerText();
}

test.slow();

test("quadro por camadas: paleta pronta, formato coração com pingente e ímã com pausa (#100)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(
    `INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG, td) VALUES ('PLA','Preto','X',99,1000,800,0,0.6), ('PLA','Cinza','X',99,1000,800,0,NULL), ('PLA','Branco','X',99,1000,800,0,4)`,
  );
  await go(page, "Litofania e quadro");
  await page.getByRole("button", { name: "Quadro por camadas", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await page.getByRole("button", { name: "Preto e branco" }).click();
  await expect(page.getByRole("button", { name: "Preto e branco" })).toHaveAttribute("aria-pressed", "true");
  const rect = await settled(page);
  await page.getByRole("button", { name: "Coração" }).click();
  await page.getByRole("group", { name: "Furo para pendurar" }).getByRole("button", { name: "Pingente" }).click();
  await page.getByRole("switch", { name: /Encaixe de ímã/ }).check();
  await settled(page);
  await expect(hud(page)).not.toHaveText(rect);
  await expect(page.locator('[aria-label="Trocas de filamento"]')).toContainText("coloque o ímã");
  if (SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `${SHOTS}/quadro-formatos-${scheme}.png`, fullPage: true });
    }
});
