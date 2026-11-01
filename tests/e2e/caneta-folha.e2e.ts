import { expect, go, openApp, test } from "./tauri";

// #317: folha, desenhos explicativos e simulação. SHOTS=<pasta> guarda prints.
const SHOTS = process.env.SHOTS;

test("caneta: folha A5 na prévia, caneta na frente do bico e simulação desenhando", async ({ page }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByRole("textbox", { name: "Texto" }).fill("Feliz aniversário, Bia!");
  await page.getByRole("button", { name: "Adicionar à mesa" }).click();
  await page.getByText(/Desenho perto da borda da mesa/).click();
  await expect(page.getByText(/Folha de 148 × 210 mm/)).toBeVisible();
  await page.getByLabel(/^Distância para a frente ou para trás/).fill("28");
  await page.getByLabel(/^Distância para o lado/).fill("0");
  await expect(page.getByRole("img", { name: /28 mm para a frente do bico/ })).toBeVisible();
  if (SHOTS) await page.getByRole("img", { name: /Como montar a caneta/ }).screenshot({ path: `${SHOTS}/montar.png` });
  if (SHOTS) await page.getByRole("img", { name: /De cima/ }).screenshot({ path: `${SHOTS}/de-cima.png` });
  await page.getByRole("button", { name: "À esquerda" }).click();
  await page.getByLabel(/^Distância para o lado/).fill("12");
  if (SHOTS) await page.getByRole("img", { name: /De cima/ }).screenshot({ path: `${SHOTS}/de-cima-lado.png` });
  await page.getByRole("button", { name: "5×" }).click();
  await page.getByRole("button", { name: "Simular o desenho" }).click();
  await expect(page.getByText(/\d+% desenhado/)).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pausar" }).click();
  if (SHOTS) await page.locator(".preview-col").screenshot({ path: `${SHOTS}/simulacao.png` });
  await page.getByRole("button", { name: "A4", exact: true }).click();
  await expect(page.getByText(/maior que a área que a caneta alcança/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a4.png`, fullPage: true });
});
