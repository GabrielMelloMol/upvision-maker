import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("dados de RPG: d20, troca de dado, bolinhas no d6 e conjunto completo numa mesa (#105)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Dados");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Dados de RPG", exact: true }).click();
  await idle(page);
  // d20 de 20 mm entre faces: a altura é a pedida, apoiado numa face
  await expect(hud(page)).toContainText("× 20.0 mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Gravação");
  await expect(page.getByText(/100% de preenchimento/)).toBeVisible();
  await expect(page.getByText(/ative o suporte em árvore/)).toBeVisible(); // o d20 tem faces além de 45°

  // d6 com bolinhas: um cubo de 20 mm (sem aviso de suporte)
  await page.getByRole("group", { name: "Dado" }).getByRole("button", { name: "d6", exact: true }).click();
  await page.getByRole("group", { name: "O que vai em cada face" }).getByRole("button", { name: "Bolinhas (só d6)" }).click();
  await idle(page);
  await expect(hud(page)).toContainText("20.0 × 20.0 × 20.0 mm");
  await expect(page.getByText(/ative o suporte em árvore/)).toHaveCount(0);

  // conjunto completo: os 6 dados lado a lado, mais largo que um dado só
  await page.getByRole("group", { name: "Dado" }).getByRole("button", { name: "Conjunto completo (d4 a d20)" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Gravação");
  await expect(hud(page)).not.toContainText("20.0 × 20.0 × 20.0 mm");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

test("dados de RPG: texto por face: sem rótulo pede os rótulos e faltando rótulo repete e avisa", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Dados");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Dados de RPG", exact: true }).click();
  await idle(page);
  await page.getByRole("group", { name: "O que vai em cada face" }).getByRole("button", { name: "Texto ou emoji por face" }).click();
  await expect(page.getByText(/Digite o que vai em cada face/)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/^Texto de cada face/).fill("Cara, Coroa");
  await idle(page);
  await expect(page.getByText(/d20 tem 20 faces e você escreveu 2/)).toBeVisible({ timeout: 60_000 });
});
