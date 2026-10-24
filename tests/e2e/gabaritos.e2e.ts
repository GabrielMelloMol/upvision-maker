import type { Page } from "@playwright/test";
import { expect, go, openApp, pickModel, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
async function pick(page: Page, search: string, name: string) {
  await pickModel(page, search, name, { exact: true });
  await idle(page);
}
const size = async (page: Page): Promise<[number, number, number]> => {
  const m = /([\d.]+) × ([\d.]+) × ([\d.]+) mm/.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return [Number(m![1]), Number(m![2]), Number(m![3])];
};

test("gabaritos: furação, raios e etiqueta mudam com as medidas e as sugestões prontas", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pick(page, "gabarito de furação", "Gabarito de furação");
  const [w4] = await size(page);
  await page.getByRole("button", { name: "Dobradiça (broca 3, 2 furos)" }).click();
  await idle(page);
  expect((await size(page))[0]).toBeLessThan(w4 - 20);
  await pick(page, "gabarito de raios", "Gabarito de raios");
  const [, h9] = await size(page);
  await page.getByRole("button", { name: "Quinas pequenas" }).click();
  await idle(page);
  expect((await size(page))[1]).toBeLessThan(h9);
  await page.getByLabel(/^Raios/).fill("2; x");
  await idle(page);
  await expect(page.getByText(/Raio ignorado/)).toBeVisible();
  await page.getByLabel(/^Raios/).fill("1,5 2,5; 4");
  await idle(page);
  await expect(page.getByText(/Raio ignorado/)).toHaveCount(0);
  await pick(page, "gabarito de etiqueta", "Gabarito de etiqueta");
  const [wl] = await size(page);
  await page.getByRole("button", { name: "Etiqueta 100 × 50" }).click();
  await idle(page);
  expect((await size(page))[0]).toBeGreaterThan(wl + 40);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});
