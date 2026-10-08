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

test("chaveiro com emoji: seletor insere no cursor e a peça sai com o desenho (#68)", async ({ page }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await idle(page);
  const before = parseFloat((await hud(page).textContent()) ?? "0");
  await page.getByRole("button", { name: "Inserir emoji" }).click();
  await expect(page.getByRole("dialog", { name: "Emojis" })).toBeVisible();
  await page.getByRole("button", { name: "Emoji ⭐" }).click();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("Ana⭐");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Emojis" })).toHaveCount(0);
  await idle(page);
  await expect.poll(async () => parseFloat((await hud(page).textContent()) ?? "0")).toBeGreaterThan(before + 5);
});

test("chaveiro: arte do logo girada e movida à mão, com a vista de cima (#183)", async ({ page }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await idle(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SILHOUETTE) });
  await expect(page.locator(".decal-gizmo")).toBeVisible();
  await idle(page);
  const height = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[1]);
  const before = await height();
  await page.getByLabel(/^Mover para cima/).fill("30");
  await expect.poll(height).toBeGreaterThan(before + 15);
  await page.getByLabel(/^Girar a arte/).fill("45");
  await page.getByRole("button", { name: "Voltar ao automático" }).click();
  await expect(page.getByLabel(/^Mover para cima/)).toHaveValue("0");
  await expect(page.getByLabel(/^Girar a arte/)).toHaveValue("0");
  await idle(page);
  await expect.poll(height).toBeCloseTo(before, 0);
});
