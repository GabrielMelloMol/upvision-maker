import { expect, go, openApp, test } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("ajuda: botão ?, passos da tela, Usar exemplo carrega o desenho e tecla ? (#84)", async ({ page }) => {
  await openApp(page);
  await go(page, "Cortador de biscoito");
  await page.getByRole("button", { name: "Ajuda: Cortador de biscoito" }).click();
  const sheet = page.getByRole("dialog", { name: "Cortador de biscoito" });
  await expect(sheet.locator(".help-steps li")).toHaveCount(5);
  await expect(sheet).toContainText("borda na mesa");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajuda-cortador.png` });
  await sheet.getByRole("button", { name: "Usar um desenho de exemplo" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });

  // tecla ? fora de campo abre a ajuda da tela atual; dentro de campo é só texto
  await go(page, "Chaveiros");
  await page.getByLabel("Texto", { exact: true }).press("?");
  await expect(page.getByRole("dialog", { name: "Chaveiros" })).toHaveCount(0);
  await page.locator("h1").click();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Chaveiros" })).toBeVisible();
  await page.getByRole("button", { name: "Termos técnicos" }).click();
  await expect(page.getByRole("dialog", { name: "Termos técnicos" })).toContainText("Folga");
});

test("busca ⌘K acha artigos e termos; ⓘ nos campos técnicos (#84)", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("folga");
  await page.getByRole("option", { name: /O que é Folga\?/ }).click();
  await expect(page.getByRole("dialog", { name: "Termos técnicos" }).locator("[data-highlight]")).toContainText("Folga");
  await page.getByRole("button", { name: "Entendi" }).click();

  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("foto em relevo");
  await page.getByRole("option", { name: /Como usar: Foto em relevo/ }).click();
  await expect(page.getByRole("heading", { name: "Foto em relevo", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Foto em relevo" })).toBeVisible();
  await page.getByRole("button", { name: "Usar uma foto de exemplo" }).click();
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 60_000 });

  // ⓘ: o campo técnico ganha a explicação como descrição (leitor de tela) e o balão no hover
  await go(page, "Chaveiros");
  await page.getByText("Opções avançadas").click(); // ajuste fino recolhido (#139)
  const relief = page.getByLabel(/^Relevo do texto/);
  await expect(relief).toHaveAccessibleDescription(/sobressai da base/);
  await page.locator(".term-tip").first().hover();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ajuda-termo.png` });
});

test("Comece por aqui: calcular um preço abre a calculadora com o exemplo; fechar some de vez (#84)", async ({ page }) => {
  await openApp(page);
  const start = page.getByRole("region", { name: "Comece por aqui" });
  await expect(start.getByRole("listitem")).toHaveCount(3);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/comece-por-aqui.png` });
  await start.getByRole("button", { name: /Calcule um preço/ }).click();
  await expect(page.getByLabel("Nome da peça")).toHaveValue("Chaveiro de exemplo");
  await expect(page.getByLabel("Gramas").first()).toHaveValue("48");
  await go(page, "Início");
  await page.getByRole("button", { name: "Fechar Comece por aqui" }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Comece por aqui" })).toHaveCount(0);
});

test("ajuda com várias imagens: tutorial de como medir a gaveta em carrossel com legenda (#140)", async ({ page }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await page.getByRole("button", { name: "Ajuda: Organizador de gaveta" }).click();
  const help = page.getByRole("dialog", { name: "Organizador de gaveta" });
  const carousel = help.getByRole("region", { name: "Imagens: Organizador de gaveta" });
  await expect(carousel.getByRole("group", { name: "1 de 5" })).toContainText("Largura");
  // a imagem carregou de verdade (não é um quadro vazio)
  await expect.poll(() => carousel.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await carousel.getByRole("button", { name: "Próxima imagem" }).click();
  await expect(carousel.getByRole("group", { name: "2 de 5" })).toContainText("Profundidade");
  await carousel.getByRole("button", { name: "Próxima imagem" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(carousel.getByRole("group", { name: "3 de 5" })).toContainText("Altura livre");
  await carousel.getByRole("button", { name: "Imagem 5 de 5" }).click();
  await expect.poll(() => carousel.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  if (SHOTS) await help.screenshot({ path: `${SHOTS}/ajuda-carrossel.png` });
});

test("Comece por aqui: passo já feito ganha o selo 'feito' e o quadro some com os três feitos (UX B5)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO quotes (data, createdAt) VALUES ('{}', '2026-09-20 10:00:00');
    INSERT INTO calc_history (name, data, at) VALUES ('Chaveiro', '{}', '2026-09-20 10:00:00')`);
  await go(page, "Calculadora");
  await go(page, "Início");
  const start = page.getByRole("region", { name: "Comece por aqui" });
  await expect(start.getByRole("listitem").nth(1)).toContainText("feito");
  await expect(start.getByRole("listitem").nth(2)).toContainText("feito");
  await expect(start.getByRole("listitem").nth(0)).not.toContainText("feito");
  if (SHOTS) await start.screenshot({ path: `${SHOTS}/comece-por-aqui-feito.png` });
  tauri.db.exec(`INSERT INTO tool_state (id, data, updatedAt) VALUES ('keychain', '{}', '2026-09-20T10:00:00Z')`);
  await go(page, "Calculadora");
  await go(page, "Início");
  await expect(page.getByRole("region", { name: "Comece por aqui" })).toHaveCount(0);
});
