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
  test.slow(); // prévia 3D pesada: com a máquina em carga passa de 60 s (sozinho, ~5 s)
  await openModel(page, "Rolo de textura");
  await page.screenshot({ path: "test-results/rolo.png" });
  await page.getByRole("button", { name: "Cabos impressos" }).click();
  await page.getByRole("button", { name: "Baixo (desenho rebaixado)" }).click();
  await idle(page);
  await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  await save3mf(page, tauri.files);
});

test("quadro de metas (#75): grade de números com título e suporte; muitos números avisam; 3MF", async ({ page, tauri }) => {
  test.slow(); // prévia 3D pesada: com a máquina em carga passa de 60 s (sozinho, ~5 s)
  await openModel(page, "Quadro de metas");
  await expect(page.locator(".legend")).toContainText("Números e título");
  await page.screenshot({ path: "test-results/metas.png" });
  await page.getByLabel(/^De quanto em quanto/).fill("5");
  await idle(page);
  await expect(page.getByText(/primeiros 100 números/)).toBeVisible();
  await page.getByLabel(/^De quanto em quanto/).fill("50");
  await idle(page);
  await save3mf(page, tauri.files);
});

test("azulejo em relevo e molde de gesso (#116): padrão que emenda, molde junto, conjunto 3×3 e 3MF", async ({ page, tauri }) => {
  await openModel(page, "Azulejo em relevo e molde de gesso");
  await expect(page.locator(".viewer .hud")).toContainText("100.0 × 100.0 × 6.0 mm");
  await page.getByRole("group", { name: "Gerar" }).getByRole("button", { name: "Os dois" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Molde");
  await page.getByRole("group", { name: "Gerar" }).getByRole("button", { name: "3×3" }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("300.0 × 300.0 × 6.0 mm");
  await page.getByRole("group", { name: "Gerar" }).getByRole("button", { name: "Os dois" }).click();
  await page.getByRole("group", { name: "Padrão" }).getByRole("button", { name: "Ondas" }).click();
  await idle(page);
  await save3mf(page, tauri.files);
  expect([...tauri.files.keys()].some((k) => k.endsWith(".3mf"))).toBe(true);
});

test("utilitários paramétricos (#121): arruela, marcador, pente de cabos, botão e adaptador abrem, medem e salvam 3MF", async ({ page, tauri }) => {
  await openModel(page, "Espaçador, calço ou arruela");
  await page.getByLabel(/^Quantidade/).fill("9");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");
  await save3mf(page, tauri.files);

  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Marcador de horta");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Marcador de horta ou planta", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Texto");
  await page.getByLabel("Nome da planta").fill("Manjericão");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("50.0 × 125.0");

  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Clipe e pente");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Clipe e pente de cabos", exact: true }).click();
  await idle(page);
  await page.getByLabel(/^Número de cabos/).fill("5");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");

  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Botão ou manopla");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Botão ou manopla", exact: true }).click();
  await idle(page);
  await page.getByRole("group", { name: "Furo do eixo" }).getByRole("button", { name: "Redondo" }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("× 18.0 mm");

  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Adaptador de mangueira");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Adaptador de mangueira ou aspirador", exact: true }).click();
  await idle(page);
  await page.getByLabel(/^Diâmetro interno B/).fill("12");
  await page.getByLabel(/^Comprimento do cone/).fill("5");
  await idle(page);
  await expect(page.getByText(/passa de 45°/)).toBeVisible();
  await page.getByLabel(/^Diâmetro interno B/).fill("25");
  await page.getByLabel(/^Comprimento do cone/).fill("25");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("36.0 × 36.0 × 85.0 mm");
  tauri.files.clear();
  await save3mf(page, tauri.files);
});
