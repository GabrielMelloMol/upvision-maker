import { expect, go, openApp, test } from "./tauri";

// #333: várias canetas (cores) num arquivo só, com pausa para trocar.
const SHOTS = process.env.SHOTS;

test("caneta: forma na caneta 2 sai em outra cor, com uma pausa de troca e a ordem na tela", async ({ page }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await page.getByRole("group", { name: "Nova camada" }).getByRole("button", { name: "Texto" }).click();
  await page.getByRole("button", { name: "Adicionar à mesa" }).click();
  await page.getByRole("group", { name: "Nova camada" }).getByRole("button", { name: "Forma" }).click();
  await page.getByRole("combobox", { name: "Caneta", exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Adicionar à mesa" }).click();
  await expect(page.getByLabel("G-code")).toHaveValue(/troque pela caneta 2/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Ordem das canetas" })).toBeVisible();
  await expect(page.locator(".plot-preview polyline[stroke='#2A7D3A']").first()).toBeAttached();
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/cores.png` });
    await page.locator(".card", { has: page.getByRole("heading", { name: "Ordem das canetas" }) }).screenshot({ path: `${SHOTS}/ordem.png` });
    await page.locator(".card", { has: page.getByRole("combobox", { name: "Caneta", exact: true }) }).screenshot({ path: `${SHOTS}/editor.png` });
  }
});
