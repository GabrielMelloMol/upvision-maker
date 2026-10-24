import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, openApp, pickModel, settleColors, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 120_000 });
const names3mf = (buf: Buffer) => [...strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).matchAll(/<object id="\d+" name="([^"]*)" type="model"><components>/g)].map((m) => m[1]);

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await openApp(page);
  await pickModel(page, "Caixa organizadora", /Caixa organizadora/);
  await idle(page);
}
const view = (page: Page, name: string) => page.getByRole("group", { name: "Vista da prévia" }).getByRole("button", { name, exact: true });

test("Caixa organizadora: sugestão por uso, deslizante com número e ajuda, jeitos de dividir com mapa, 4 vistas e o 3MF com cada peça (#204)", async ({ page, tauri }) => {
  test.slow();
  await open(page);
  // sugestões por uso: um clique preenche os campos e a frase explica
  const uses = page.getByRole("group", { name: "Comece pelo uso" });
  await expect(uses.getByRole("button")).toHaveCount(9);
  await uses.getByRole("button", { name: "Pequena 3×2" }).click();
  await expect(uses.getByRole("button", { name: "Pequena 3×2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^Largura \(mm\)/)).toHaveValue("100");
  await expect(page.getByText("Caixa de bolso com 6 nichos", { exact: false })).toBeVisible();
  // deslizante e número andam juntos; a frase mostra a outra leitura da medida
  await expect(page.getByText("Por dentro: 95,2 mm.")).toBeVisible();
  await page.locator('input[type=range][data-for="Largura"]').fill("140");
  await expect(page.getByLabel(/^Largura \(mm\)/)).toHaveValue("140");
  await expect(page.getByText("Por dentro: 135,2 mm.")).toBeVisible();
  await page.getByLabel(/^Largura \(mm\)/).fill("150");
  await expect(page.locator('input[type=range][data-for="Largura"]')).toHaveValue("150");
  await page.getByRole("button", { name: "Por dentro", exact: true }).click();
  await expect(page.getByText("Por fora: 154,8 mm.")).toBeVisible();
  await page.getByRole("button", { name: "Por fora", exact: true }).click();
  // jeitos de dividir: mapa ao vivo e editor de faixas
  const map = page.getByRole("group", { name: /Mapa das divisórias: 3 × 2 nichos/ });
  await expect(map).toBeVisible();
  await page.getByRole("button", { name: "Largos + pequenos", exact: true }).click();
  await expect(page.getByRole("group", { name: /Mapa das divisórias: 2 nichos em 2 faixas|Mapa das divisórias/ })).toBeVisible();
  await page.getByRole("button", { name: "Faixa por faixa", exact: true }).click();
  await page.getByRole("button", { name: "+ faixa" }).click();
  await expect(page.getByText("Faixa 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remover faixa 3" }).click();
  await expect(page.getByText("Faixa 3", { exact: true })).toHaveCount(0);
  // medida útil do nicho ao focar
  await page.locator(".divider-map-cell").first().focus();
  await expect(page.locator(".divider-map-read")).toContainText(/\d+,\d × \d+,\d mm/);
  // as 4 vistas
  await idle(page);
  await view(page, "Compartimentos").click();
  await expect(page.locator(".legend", { hasText: "Tampa" })).toHaveCount(0);
  await view(page, "Tampa aberta").click();
  await expect(page.locator(".legend")).toContainText("Tampa");
  await view(page, "Fechada").click();
  await view(page, "Peças na mesa").click();
  await expect(hud(page)).toContainText("×");
  // a caixa padrão (180 mm) e a tampa não cabem juntas numa mesa de 256 mm: a tampa vai para a 2ª mesa, com aviso
  await page.getByRole("button", { name: "Parafusos 5×4" }).click();
  await idle(page);
  await expect(page.getByText(/não cabem juntas numa mesa de 256 mm: .*Tampa na mesa 2/)).toBeVisible();
  await page.getByRole("button", { name: "Pequena 3×2" }).click();
  await idle(page);
  await expect(page.getByText(/não cabem juntas numa mesa/)).toHaveCount(0);
  // nicho pequeno demais: some a prévia e a frase de ajuda explica
  await page.getByRole("button", { name: "Iguais", exact: true }).click();
  await page.getByLabel(/^Fileiras/).fill("8");
  await expect(page.getByText(/pequeno demais para pegar a peça/).first()).toBeVisible();
  await page.getByLabel(/^Fileiras/).fill("2");
  await idle(page);
  // puxador entra como peça solta; o 3MF leva cada peça com o nome certo
  await page.getByRole("switch", { name: /Puxador/ }).check();
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const names = names3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]);
  expect(names.sort()).toEqual(["Caixa", "Pino 1", "Pino 2", "Puxador", "Tampa"]);
});

test("Caixa organizadora: material muda a folga da trava num passo só, e a ajuda tem quando usar, dicas e perguntas", async ({ page }) => {
  test.slow();
  await open(page);
  await expect(page.getByLabel(/^Folga da trava/)).toHaveValue("0.4");
  await page.getByRole("button", { name: "PLA", exact: true }).click();
  await expect(page.getByLabel(/^Folga da trava/)).toHaveValue("0.35");
  await page.getByRole("button", { name: "Nylon", exact: true }).click();
  await expect(page.getByLabel(/^Folga da trava/)).toHaveValue("0.5");
  const help = page.locator("details", { hasText: "Como usar" }).first();
  await help.locator("summary").first().click();
  await expect(help.getByText("Quando usar")).toBeVisible();
  await expect(help.getByText("Quando não usar")).toBeVisible();
  await expect(help.getByRole("table")).toContainText("Largura");
  // as dicas de impressão aparecem uma vez só: no recolhível do Salvar 3MF (com as do modelo), não dentro do Como usar
  await expect(help.getByText("Dicas de impressão")).toHaveCount(0);
  await expect(page.locator(".export-tips")).toHaveCount(1);
  await page.locator(".export-tips summary").click();
  await expect(page.locator(".export-tips").getByText(/PETG é o melhor para a dobradiça/)).toBeVisible();
  await help.getByText("Como encaixo o pino da dobradiça?").click();
  await expect(help.getByText(/empurre cada pino/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`Caixa organizadora: sem violação de acessibilidade (${scheme})`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await page.getByRole("button", { name: "Faixa por faixa", exact: true }).click();
    await page.getByText("Como usar").first().click();
    await idle(page);
    await expect(page.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled({ timeout: 60_000 });
    await settleColors(page);
    const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

test("Imagem para divulgar: PNG da caixa fechada com fundo claro, pelo diálogo de salvar (#211)", async ({ page, tauri }) => {
  test.slow();
  await open(page);
  await page.getByRole("button", { name: "Imagem para divulgar" }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible({ timeout: 60_000 });
  const png = [...tauri.files].find(([p]) => p.endsWith("-divulgacao.png"))![1];
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.length).toBeGreaterThan(20_000);
  if (process.env.SHOTS_DIR) (await import("node:fs")).writeFileSync(`${process.env.SHOTS_DIR}/imagem-para-divulgar.png`, png);
});

test("Caixa organizadora: no tamanho máximo a caixa é reduzida para a mesa e o aviso diz o que mudou (#204)", async ({ page }) => {
  await open(page);
  await page.getByLabel(/^Largura \(mm\)/).fill("300");
  await page.getByLabel(/^Profundidade \(mm\)/).fill("300");
  const note = page.getByText("Você pediu uma caixa de 300 × 300 mm", { exact: false });
  await expect(note).toBeVisible({ timeout: 120_000 });
  await expect(note).toContainText("Reduzi para 252 × 242 mm");
  await expect(note).toContainText("impressora de mesa maior");
  if (process.env.SHOTS_DIR) {
    mkdirSync(process.env.SHOTS_DIR, { recursive: true });
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/aviso-caixa-maximo.png` });
  }
});
