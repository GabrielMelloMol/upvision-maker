import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
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
  await page.screenshot({ path: `${PRINTS}/${name}.png` });
}

/** PNG 16×16: metade de cima vermelha, a de baixo azul, com um disco (uma "foto" simples). */
function twoColorPng(size = 64): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const inside = Math.hypot(x - size / 2, y - size / 2) < size * 0.42;
      if (!inside) continue;
      const rgb = y < size / 2 ? [214, 40, 40] : [37, 99, 235];
      raw.set(rgb, y * stride + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("mosaico: tabuleiro, peças, pote, desenho e cartões, do começo ao arquivo", async ({ page, tauri }) => {
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
  await expect(page.locator(".legend")).toContainText("Azul");
  await shot(page, "04-pecas");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "mosaico-pecas.3mf")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /mosaico-pecas.*\.3mf$/.test(p))).toBe(true);

  // só as peças do desenho
  await page.getByRole("button", { name: "Só as do desenho" }).click();
  await expect(page.getByText(/Imprime só as peças do desenho/)).toBeVisible();
  await idle(page);
  await expect(page.locator(".legend")).not.toContainText("Laranja");
  await shot(page, "05-pecas-do-desenho");

  // pote
  await tab(page, "Pote");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Tampa");
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

test("mosaico: foto vira mosaico com as cores do kit e a lista de peças", async ({ page }) => {
  await openApp(page);
  await go(page, "Mosaico");
  await tab(page, "Desenho");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "bola.png", mimeType: "image/png", buffer: twoColorPng() });
  await expect(page.getByRole("heading", { name: /Peças do desenho: \d+ · bola/ })).toBeVisible({ timeout: 30_000 });
  const list = page.getByLabel("Peças do desenho");
  await expect(list).toContainText("vermelho");
  await expect(list).toContainText("azul");
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
