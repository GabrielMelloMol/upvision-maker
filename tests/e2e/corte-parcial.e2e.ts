import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, settleColors, test, toastWith } from "./tauri";

// o corte roda em worker com WASM próprio: com muitos testes em paralelo o cálculo demora mais que os 5 s padrão
const expect = baseExpect.configure({ timeout: 30_000 });

// recalculando = véu (1º cálculo) ou o indicador discreto do canto (já há modelo na tela)
const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0, { timeout: 60_000 });
};
/** Espera as alças pararem na tela (a câmera termina de pousar) antes de arrastar. */
async function handlesAt(page: Page, id: string): Promise<[number, number]> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const now = (await page.locator(".viewer").getAttribute("data-handles")) ?? "";
    // assentou E a alça pedida já existe: com a máquina em carga a caixa ainda estava recalculando e a alça "max2" não tinha aparecido
    const at = now ? (JSON.parse(now) as Record<string, [number, number]>)[id] : undefined;
    if (now && now === last && at) return at;
    last = now;
    await page.waitForTimeout(300);
  }
  throw new Error("as alças não assentaram");
}
const STL = resolve("tests/fixtures/stl/personagem-arvore.stl");
const set = (page: Page, label: RegExp, v: number) => page.getByLabel(label).fill(String(v));

test("corte parcial: corta só a cabeça do personagem e deixa a árvore intacta; salva o 3MF com resto, pedaço e pinos", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await expect(page.getByText(/Use só modelos que são seus ou cuja licença permite/)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(STL);
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("×");

  // a caixa começa na peça toda; reduz até pegar só a cabeça do personagem (a árvore fica fora)
  await set(page, /^X de/, -4);
  await set(page, /^X até/, 20);
  await set(page, /^Z de/, 24);
  await set(page, /^Posição do plano/, 31);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Pedaço");
  await expect(page.locator(".legend")).toContainText("Região");
  await expect(page.getByText(/Conferido: as duas peças saem fechadas/)).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("personagem-arvore-corte.3mf"))).toBe(true);
});

test("corte parcial: arrastar a alça da face na vista 3D muda a região (e o slider acompanha); botões de vista", async ({ page }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await page.locator('input[type="file"]').first().setInputFiles(STL);
  await idle(page);
  await set(page, /^Z de/, 20);
  await set(page, /^Z até/, 45);
  await idle(page);
  const viewer = page.locator(".viewer");
  const handles = async () => JSON.parse((await viewer.getAttribute("data-handles")) ?? "{}") as Record<string, [number, number]>;
  const top = await handlesAt(page, "max2");
  expect(top).toBeTruthy();
  const before = await page.getByLabel(/^Z até/).inputValue();
  await page.mouse.move(top[0], top[1]);
  await page.mouse.down();
  await page.mouse.move(top[0], top[1] - 40, { steps: 6 });
  await page.waitForTimeout(500); // passa o debounce: o corte recalcula com a peça ainda na tela
  await expect(page.locator(".viewer .overlay")).toHaveCount(0); // sem véu borrado, só o indicador do canto
  await page.mouse.up();
  await expect.poll(async () => page.getByLabel(/^Z até/).inputValue()).not.toBe(before);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Pedaço");
  // vistas: de cima o 3/4 muda a câmera (as alças andam na tela)
  const iso = await handlesAt(page, "max2");
  await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Cima" }).click();
  await expect.poll(async () => (await handles()).max2, { timeout: 15_000 }).not.toEqual(iso);
});

test("corte parcial: trocar para cilindro ajusta o raio à cabeça (parte + margem) e avisa se a região corta pelo lado", async ({ page }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await page.locator('input[type="file"]').first().setInputFiles(STL);
  await idle(page);
  await set(page, /^Posição do plano/, 31);
  await page.getByRole("button", { name: "Cilindro" }).click();
  await expect.poll(async () => Number(await page.getByLabel(/^Raio/).inputValue())).toBeGreaterThan(9);
  await idle(page);
  await expect(page.getByText(/corta a peça pelo lado/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Centrar a região" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Região na parte clicada" })).toBeVisible();
  await set(page, /^Raio/, 3);
  await idle(page);
  await expect(page.getByText(/corta a peça pelo lado.*aumente o raio/)).toBeVisible();
});

test("corte parcial: dois cortes, cor por pedaço, peso e tempo por peça e desfazer por corte", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await page.locator('input[type="file"]').first().setInputFiles(STL);
  await idle(page);
  await set(page, /^X de/, -4);
  await set(page, /^X até/, 20);
  await set(page, /^Z de/, 24);
  await set(page, /^Posição do plano/, 31);
  await page.getByRole("button", { name: /Adicionar corte/ }).click();
  await expect(page.getByRole("button", { name: "Corte 2", pressed: true })).toBeVisible();
  await set(page, /^Posição do plano/, 14);
  await page.getByRole("switch", { name: /Pedaço 2 em outra cor/ }).check();
  await page.getByRole("switch", { name: /Resto em outra cor/ }).check();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Pedaço 1");
  await expect(page.locator(".legend")).toContainText("Pedaço 2");
  const card = page.getByLabel("Peso e tempo por peça");
  await expect(card).toContainText("pedaço 1");
  await expect(card).toContainText(/≈ [\d,]+ g/);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("personagem-arvore-corte.3mf"))).toBe(true);
  // desfazer: o último passo (a cor do resto) e depois o corte 2 inteiro
  await page.getByRole("button", { name: "Desfazer" }).first().click();
  await expect(page.getByRole("switch", { name: /Resto em outra cor/ })).not.toBeChecked();
});

test("corte parcial: analisa as saliências, sugere cortar logo abaixo do braço e aplica o corte (worker no navegador)", async ({ page }) => {
  await openApp(page);
  await go(page, "Corte parcial");
  await page.locator('input[type="file"]').first().setInputFiles(resolve("tests/fixtures/stl/boneco-braco.stl"));
  await idle(page);
  await page.getByRole("button", { name: "Analisar o modelo" }).click();
  const list = page.getByRole("list", { name: "Sugestões de corte" });
  await expect(list).toBeVisible({ timeout: 60_000 });
  await expect(list.getByRole("listitem").first()).toContainText(/Cortar a 1[78],\d mm: tira \d+% da área no ar/);
  await list.getByRole("button", { name: "Usar este corte" }).first().click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Corte 1", pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Adicionar corte/ })).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Pedaço");
  await expect(page.getByLabel(/^Posição do plano/)).toHaveValue(/^1[78]/);
});

for (const width of [1280, 720]) {
  test(`corte parcial: tela com o arquivo aberto passa no axe, claro e escuro (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openApp(page);
    await go(page, "Corte parcial");
    await page.locator('input[type="file"]').first().setInputFiles(STL);
    await idle(page);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settleColors(page);
      const axe = await new AxeBuilder({ page }).exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(axe.violations.filter((v) => !v.nodes.every((n) => n.target.join(" ").includes("hud"))).map((v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
}
