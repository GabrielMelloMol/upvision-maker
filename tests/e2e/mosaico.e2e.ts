import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
/** Com MOSAICO_PRINTS=<pasta>, guarda prints da tela (só da página do app). */
const PRINTS = process.env.MOSAICO_PRINTS;
async function shot(page: Page, name: string) {
  if (!PRINTS) return;
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}-v2.png` });
}

test("mosaico: tabuleiro, peças, pote, desenho e cartões, do começo ao arquivo", async ({ page, tauri }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // a câmera não desliza nem gira: o print sai com o enquadramento final
  await page.setViewportSize({ width: 1280, height: 900 });
  test.setTimeout(240_000); // passa por todas as abas, cada uma refazendo o kit
  await openApp(page);
  await go(page, "Mosaico");
  await idle(page);
  await expect(hud(page)).toContainText("mm");

  // tabuleiro
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "mosaico-tabuleiro.3mf")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /mosaico-tabuleiro.*\.3mf$/.test(p))).toBe(true);
  await shot(page, "01-tabuleiro");

  // desenho: o cartão da borboleta monta no tabuleiro, e uma pincelada muda a lista de peças
  await tab(page, "Desenho");
  await page.getByRole("button", { name: "Borboleta" }).click();
  await expect(page.getByRole("heading", { name: /Peças do desenho: 48 · Borboleta/ })).toBeVisible();
  await shot(page, "02-desenho-borboleta");
  const editor = page.getByRole("application", { name: /Desenho do mosaico/ });
  await page.getByRole("group", { name: "Cor do pincel" }).getByRole("button", { name: "Verde" }).click();
  await editor.scrollIntoViewIfNeeded();
  const box = (await editor.boundingBox())!; // depois de rolar: o clique do mouse usa coordenadas da janela
  await page.mouse.click(box.x + box.width * 0.07, box.y + box.height * 0.07); // casa vazia do canto
  await expect(page.getByRole("heading", { name: /Peças do desenho: 49 · Borboleta/ })).toBeVisible();

  await tab(page, "Tabuleiro");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Roxo");
  await shot(page, "03-tabuleiro-montado");

  // peças
  await tab(page, "Peças");
  await idle(page);
  const plate = page.getByLabel("Mesa de peças");
  await expect(plate.locator("option")).toHaveCount(8);
  await expect(plate.locator("option").first()).toHaveText("Mesa 1 de 8 · Vermelho");
  await expect(hud(page)).toContainText(/^(1\d\d|2[0-5]\d)(\.\d)? × \d+(\.\d)? ×/); // uma mesa só (até 256 mm), não as 8 lado a lado
  await shot(page, "04-pecas");
  await plate.selectOption({ index: 4 });
  await idle(page);
  await expect(plate.locator("option:checked")).toHaveText("Mesa 5 de 8 · Azul");
  await shot(page, "04b-pecas-mesa-5");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "mosaico-pecas.3mf")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /mosaico-pecas.*\.3mf$/.test(p))).toBe(true);

  // só as peças do desenho
  await page.getByRole("button", { name: "Só as do desenho" }).click();
  await expect(page.getByText(/Imprime só as peças do desenho/)).toBeVisible();
  await idle(page);
  await expect(page.getByLabel("Mesa de peças").locator("option")).toHaveCount(4);
  await shot(page, "05-pecas-do-desenho");

  // pote
  await tab(page, "Pote");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tampa");
  await expect(page.getByText(/a tampa fica numa mesa só dela/)).toBeVisible();
  await expect(page.getByText(/passa da mesa/)).toHaveCount(0);
  await shot(page, "06-pote");
  await page.getByRole("button", { name: "Retangular" }).click();
  await idle(page);
  await shot(page, "07-pote-retangular");

  // cartões
  await tab(page, "Cartões");
  await page.getByRole("checkbox", { name: "Gato", exact: true }).check();
  await page.getByRole("checkbox", { name: "Sapo", exact: true }).check();
  await shot(page, "08-cartoes");
  await page.getByRole("button", { name: /Salvar PDF \(3 cartões\)/ }).click();
  await expect(toastWith(page, "Cartões salvos em")).toBeVisible({ timeout: 30_000 });
  expect([...tauri.files.entries()].some(([p, b]) => /cartoes-de-inspiracao\.pdf$/.test(p) && b.length > 2000)).toBe(true);
});

/** Um pássaro desenhado num canvas (corpo azul, bico amarelo, olho, asa e pernas), como um desenho enviado. */
async function birdPng(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 320, 320);
    const disc = (x: number, y: number, r: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    };
    g.fillStyle = "#f7c52b"; // bico
    g.beginPath();
    g.moveTo(70, 120);
    g.lineTo(20, 140);
    g.lineTo(70, 160);
    g.fill();
    disc(160, 160, 100, "#2563eb"); // corpo
    disc(120, 110, 55, "#2563eb"); // cabeça
    disc(110, 100, 18, "#ffffff"); // olho
    disc(106, 100, 8, "#1c1c1e");
    disc(190, 175, 48, "#16a34a"); // asa
    g.fillStyle = "#d62828"; // pernas
    g.fillRect(135, 255, 14, 45);
    g.fillRect(185, 255, 14, 45);
    return c.toDataURL("image/png");
  });
  return Buffer.from(url.split(",")[1], "base64");
}

test("mosaico: um desenho enviado (pássaro) vira mosaico com as cores do kit e a lista de peças", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await openApp(page);
  await go(page, "Mosaico");
  await tab(page, "Desenho");
  await page.getByLabel("Casas no lado maior").fill("14");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "passaro.png", mimeType: "image/png", buffer: await birdPng(page) });
  await expect(page.getByRole("heading", { name: /Peças do desenho: \d+ · passaro/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Imagem enviada: passaro.png" })).toBeVisible();
  const list = page.getByLabel("Peças do desenho");
  for (const cor of ["azul", "amarelo", "verde", "vermelho"]) await expect(list).toContainText(cor);
  await shot(page, "09-imagem-para-mosaico");
});

test("mosaico: valor fora da faixa não gera e avisa", async ({ page }) => {
  await openApp(page);
  await go(page, "Mosaico");
  await page.getByLabel("Colunas").fill("40");
  await expect(page.getByText("Corrija os campos em vermelho para ver o kit.")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  for (const [label, size] of [["largo", { width: 1280, height: 800 }], ["estreito", { width: 700, height: 900 }]] as const)
    test(`mosaico: sem violação de acessibilidade (axe) em todas as abas, tema ${scheme}, ${label}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(size);
      await openApp(page);
      await go(page, "Mosaico");
      await page.getByRole("button", { name: "Cauda de andorinha" }).click();
      for (const name of ["Tabuleiro", "Peças", "Pote", "Desenho", "Cartões"]) {
        await tab(page, name);
        if (name === "Desenho") await page.getByRole("button", { name: "Gato" }).click();
        if (name === "Cartões") await page.getByRole("checkbox", { name: "Gato", exact: true }).check();
        await idle(page);
        const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
        expect(r.violations.map((v) => `${name}: ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`), `${name}`).toEqual([]);
      }
    });
