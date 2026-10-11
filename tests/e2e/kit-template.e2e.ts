import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

async function openKit(page: Page, name: string) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: name, exact: true }).click();
  await idle(page);
}

for (const [name, wheels] of [["Kit: carro", "Prenda cada roda"], ["Kit: caminhão", "Prenda cada roda"]] as const)
  test(`${name}: cartão e montado na prévia, avisos de montagem, parâmetros e axe`, async ({ page }) => {
    await openKit(page, name);
    // o texto de montagem e a legenda das cores por grupo aparecem
    await expect(page.getByText(new RegExp(wheels))).toBeVisible();
    await expect(page.locator(".viewer").getByText("Carroceria")).toBeVisible();
    // proporções e rodas são campos da tela
    await expect(page.getByLabel(/^Comprimento( \(mm\))?$/)).toBeVisible();
    await expect(page.getByLabel(/^Diâmetro das rodas/)).toBeVisible();
    await expect(page.getByLabel(/^Folga do giro da roda/)).toBeVisible();
    // mudar o diâmetro da roda refaz o modelo sem erro
    const d = page.getByLabel(/^Diâmetro das rodas/);
    await d.fill("22");
    await d.blur();
    await idle(page);
    await expect(page.getByText(new RegExp(wheels))).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
