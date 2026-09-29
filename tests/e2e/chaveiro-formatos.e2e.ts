import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const SILHOUETTE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

test("chaveiro: etiqueta retangular em 3 cores, nome em duas linhas, lote e silhueta (#67)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await page.getByRole("button", { name: "Retângulo" }).click();
  await page.getByRole("button", { name: "3 cores" }).click();
  await page.getByLabel("Texto", { exact: true }).fill("Ana|Silva");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Meio");

  await page.getByRole("button", { name: "Lote de nomes" }).click();
  await page.getByLabel(/^Nomes/).fill("Ana|Silva\nBia|Souza\nCaio");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("chaveiros.3mf"))).toBe(true);

  await page.getByRole("button", { name: "Um nome" }).click();
  await page.getByRole("button", { name: "Silhueta" }).click();
  await expect(page.getByText("Envie a silhueta (SVG ou imagem) para ver o chaveiro.")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "forma.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SILHOUETTE) });
  await page.getByLabel(/^Altura da silhueta/).fill("50");
  await idle(page);
  await expect(hud(page)).toContainText("mm");
});
