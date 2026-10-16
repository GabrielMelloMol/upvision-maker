import AxeBuilder from "@axe-core/playwright";
import { deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const L_SHAPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><polygon points="0,0 30,0 30,10 10,10 10,30 0,30"/></svg>';

/** PNG de um disco preto sobre fundo branco (a silhueta de uma foto), montado na hora. */
function discPng(size = 160): Buffer {
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
  const raw = Buffer.alloc((size * 3 + 1) * size, 255);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2, y - size / 2);
      if (d < size * 0.4) raw.fill(0, y * (size * 3 + 1) + 1 + x * 3, y * (size * 3 + 1) + 4 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}


test("caixinha termoformada: telas e bases, fecho e moldes macho e fêmea em arquivos separados, com o resumo e o passo a passo", async ({ page, tauri }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await go(page, "Caixinha termoformada");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Malha");
  await expect(page.locator(".legend")).toContainText("Molde");
  await expect(page.getByRole("heading", { name: "Passo a passo da termoformagem" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumo da termoformagem" })).toContainText("Molde macho (PETG)");

  await page.getByRole("button", { name: "Natal (coração)" }).click();
  await expect(page.locator("select").first()).toHaveValue("heart");
  await idle(page);
  const saves = page.getByRole("button", { name: /Salvar 3MF/ });
  await saves.nth(0).click();
  await expect.poll(() => [...tauri.files.keys()].some((f) => /caixinha-telas.*\.3mf$/.test(f))).toBe(true);
  await saves.nth(1).click();
  await expect.poll(() => [...tauri.files.keys()].some((f) => /caixinha-fecho.*\.3mf$/.test(f))).toBe(true);
  await saves.nth(2).click();
  await expect.poll(() => [...tauri.files.keys()].some((f) => /caixinha-molde.*\.3mf$/.test(f))).toBe(true);
  await expect(page.locator(".legend")).toContainText("Base");
  await expect(page.locator(".legend")).toContainText("Molde fêmea");

  // fecho por faixa e malha em losango: continua gerando
  await page.getByRole("button", { name: "Faixa colada" }).click();
  await page.getByRole("button", { name: "Losango" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Faixa");
});

test("caixinha termoformada: tampa rosqueada, prévias montada e casca, água quente e texto para a IA", async ({ page }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await go(page, "Caixinha termoformada");
  await idle(page);
  await page.getByRole("button", { name: "Tampa rosqueada" }).click();
  await idle(page);
  await expect(page.getByRole("heading", { name: /Tampa rosqueada \(PLA, 0,16 mm\)/ })).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Tampa");
  await expect(page.locator(".legend")).toContainText("Pino");

  await page.getByRole("button", { name: "Montada (não imprime)" }).click();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 90_000 });
  await page.getByRole("button", { name: "Casca prensada (não imprime)" }).click();
  await idle(page);
  await expect(page.getByText(/Uma casca já prensada, de perto/)).toBeVisible();

  const steps = page.getByRole("region", { name: "Passo a passo da termoformagem" });
  await steps.getByRole("button", { name: "Água quente" }).click();
  await expect(steps).toContainText("70 a 80 °C");
  await expect(steps).toContainText("Temperaturas e tempos são de referência");

  await page.getByText("Não tem a silhueta? Peça a uma IA de imagem").click();
  await expect(page.getByLabel("Texto para a IA de imagem")).toHaveValue(/perfeitamente simétrica/);
  await expect(page.getByRole("button", { name: /Copiar texto/ })).toBeVisible();
});

test("caixinha termoformada: foto PNG como silhueta e silhueta assimétrica espelhada", async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await go(page, "Caixinha termoformada");
  await page.getByRole("button", { name: "Imagem ou SVG" }).click();
  await expect(page.getByText("Envie a silhueta (SVG ou imagem) para ver a caixinha.")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "disco.png", mimeType: "image/png", buffer: discPng() });
  await expect(page.getByText("disco.png")).toBeVisible({ timeout: 30_000 });
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 90_000 });

  await page.locator('input[type="file"]').first().setInputFiles({ name: "ele.svg", mimeType: "image/svg+xml", buffer: Buffer.from(L_SHAPE) });
  await expect(page.getByText(/A silhueta não é simétrica/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Espelhar a esquerda" }).click();
  await idle(page);
  await expect(page.getByText(/A silhueta não é simétrica/)).toHaveCount(0);
});

test("caixinha termoformada: sem violação estrutural de acessibilidade (axe)", async ({ page }) => {
  await openApp(page);
  await go(page, "Caixinha termoformada");
  await page.getByText("Opções avançadas").click();
  await idle(page);
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
