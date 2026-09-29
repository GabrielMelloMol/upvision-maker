import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

// Modelos de cozinha e casa da fila da Lupa (#63, #65, #66, #73, #59, #64, #75).
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function openModel(page: Page, name: string) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
}

async function save3mf(page: Page, files: Map<string, unknown>) {
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
}

test("cortador em grade (#63): prévia com cortador e texto, aviso da mesa e 3MF", async ({ page, tauri }) => {
  await openModel(page, "Cortador em grade");
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByLabel(/^Colunas/).fill("12");
  await idle(page);
  await expect(page.getByText(/passa da mesa de 256 mm/)).toBeVisible();
  await page.getByLabel(/^Colunas/).fill("4");
  await idle(page);
  await save3mf(page, tauri.files);
});

test("suporte de palitos (#65): base com peso ganha a tampa; 3MF", async ({ page, tauri }) => {
  await openModel(page, "Suporte de palitos");
  await page.getByRole("button", { name: "Com lugar para peso" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tampa");
  await save3mf(page, tauri.files);
});

test("boleira (#65): nome embutido em outra cor, aviso do pé a 45° e 3MF", async ({ page, tauri }) => {
  await openModel(page, "Boleira");
  await expect(page.locator(".legend")).toContainText("Nome");
  await page.screenshot({ path: "test-results/boleira.png" });
  await page.getByLabel("Altura (mm)", { exact: true }).fill("40");
  await idle(page);
  await expect(page.getByText(/O pé foi limitado/)).toBeVisible();
  await save3mf(page, tauri.files);
});

test("cumbuca no contorno (#66): abre com o coração de exemplo e o desenho no fundo; 3MF", async ({ page, tauri }) => {
  await openModel(page, "Cumbuca no contorno");
  await expect(page.locator(".legend")).toContainText("Desenho no fundo");
  await page.screenshot({ path: "test-results/cumbuca.png" });
  await save3mf(page, tauri.files);
});

test("molde para carimbo de EVA (#73): abre com o texto, apoio separado, inverter e 3MF", async ({ page, tauri }) => {
  await openModel(page, "Molde para carimbo de EVA");
  await expect(page.locator(".legend")).toContainText("Apoio");
  await page.getByLabel(/^Inverter/).check();
  await idle(page);
  await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  await save3mf(page, tauri.files);
});

test("estojo com tampa de rosca (#59): corpo e tampa, nome, mosaico e orelha; 3MF", async ({ page, tauri }) => {
  await openModel(page, "Estojo com tampa de rosca");
  await expect(page.locator(".legend")).toContainText("Tampa");
  await expect(page.locator(".legend")).toContainText("Nome");
  await page.getByRole("button", { name: "Ícone em mosaico" }).click();
  await page.getByLabel(/^Orelha para chaveiro/).check();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Textura");
  await page.screenshot({ path: "test-results/estojo.png" });
  await save3mf(page, tauri.files);
});

test("rolo de textura (#64): abre com o mosaico de exemplo, troca para cabos e baixo relevo; 3MF", async ({ page, tauri }) => {
  await openModel(page, "Rolo de textura");
  await page.screenshot({ path: "test-results/rolo.png" });
  await page.getByRole("button", { name: "Cabos impressos" }).click();
  await page.getByRole("button", { name: "Baixo (desenho rebaixado)" }).click();
  await idle(page);
  await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  await save3mf(page, tauri.files);
});
