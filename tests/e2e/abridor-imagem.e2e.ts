import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, go, openApp, settleColors, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const gato = resolve("tests/fixtures/gato-abridor.png");

async function open(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("abridor com sua arte");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro abridor com sua arte", exact: true }).click();
  await idle(page);
}

/** Largura e altura (mm) do chip de medidas da prévia. */
async function size(page: Page): Promise<[number, number]> {
  const m = /([\d.]+) × ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? "");
  return [Number(m![1]), Number(m![2])];
}

test("abridor pela imagem: abre com exemplo, aceita imagem, sugere as cores e o abridor muda de lado", async ({ page }) => {
  await open(page);
  // abre já com o desenho de exemplo: tem prévia, medida em cm e Salvar 3MF
  await expect(page.locator(".viewer .hud-cm")).toContainText("Peça pronta:");
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();

  // imagem de verdade (PNG com fundo em degradê): base clara e relevo escuro saem sozinhos
  await page.locator('input[type="file"]').first().setInputFiles(gato);
  await expect(page.getByLabel("Relevo", { exact: true })).not.toHaveValue("#1c1c1e", { timeout: 60_000 });
  await idle(page);
  await expect(page.getByLabel("Base", { exact: true })).toHaveValue(/^#f[0-9a-f]{5}$/);
  const legend = page.locator(".viewer .legend");
  await expect(legend).toContainText("Base");
  await expect(legend).toContainText("Relevo");
  await expect(legend).toContainText("Borda");

  // abridor embaixo (padrão): a peça é mais alta que larga; trocar para a direita muda as medidas
  const [w0, h0] = await size(page);
  expect(h0).toBeGreaterThan(w0);
  await page.getByRole("group", { name: "Abridor", exact: true }).getByRole("button", { name: "Direita" }).click();
  await page.getByRole("group", { name: "Argola", exact: true }).getByRole("button", { name: "Esquerda" }).click();
  await idle(page);
  const [w1, h1] = await size(page);
  expect(w1).toBeGreaterThan(w0 + 10);
  expect(h1).toBeLessThan(h0 - 10);

  // tamanho em cm e o aviso de força
  await page.getByLabel(/^Tamanho da imagem/).fill("8");
  await idle(page);
  const [w2] = await size(page);
  expect(w2).toBeGreaterThan(w1 + 10);
  await expect(page.getByText(/não precisa de moeda/).first()).toBeVisible();

  // lata: sai o abridor de lata
  await page.getByRole("button", { name: "Lata" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
});

test("abridor pela imagem: os botões de lado e os campos passam no axe, claro e escuro", async ({ page }) => {
  await open(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
