import AxeBuilder from "@axe-core/playwright";
import { deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
/** PNG de um anel preto sobre fundo branco (como a foto de um logo), montado na hora. */
function ringPng(size = 160): Buffer {
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
      if (d < size * 0.4 && d > size * 0.25) raw.fill(0, y * (size * 3 + 1) + 1 + x * 3, y * (size * 3 + 1) + 4 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/><circle cx="10" cy="10" r="5" fill="#fff"/></svg>';

test("carimbo seco: duas placas, selo com texto em volta, ímãs, dobradiça e logo", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Carimbo seco");
  await idle(page);
  await expect(hud(page)).toContainText("mm");
  await expect(page.locator(".legend")).toContainText("Placa com relevo");
  await expect(page.locator(".legend")).toContainText("Placa com cavidade");

  // modelo pronto: selo redondo com texto em volta e ímãs
  await page.getByRole("button", { name: "Convite de casamento" }).click();
  await expect(page.getByLabel("Texto em cima, em volta")).toHaveValue("ANA & BRUNO");
  await expect(page.getByRole("button", { name: "Ímãs" })).toHaveAttribute("aria-pressed", "true");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => /carimbo-.*\.3mf$/.test(p))).toBe(true);

  // logo junto com o texto
  await page.locator('input[type="file"]').first().setInputFiles({ name: "selo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(LOGO) });
  await expect(page.getByText("selo.svg")).toBeVisible();
  await idle(page);

  // dobradiça: um objeto só
  await page.getByRole("button", { name: "Dobradiça" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Dobradiça");
  await expect(page.getByText(/A dobradiça é um filme/)).toBeVisible();
});

test("carimbo seco: foto PNG de um logo vira desenho e entra no carimbo junto com o texto", async ({ page }) => {
  await openApp(page);
  await go(page, "Carimbo seco");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: ringPng() });
  await expect(page.getByText("logo.png")).toBeVisible({ timeout: 30_000 });
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");
  await expect(page.locator(".legend")).toContainText("Placa com relevo");
  await expect(page.getByText("O desenho ocupa quase toda a área")).toHaveCount(0);
});

test("carimbo seco: valor fora da faixa não gera e avisa", async ({ page }) => {
  await openApp(page);
  await go(page, "Carimbo seco");
  await page.getByLabel("Largura (mm)").fill("500");
  await expect(page.getByText("Corrija os campos em vermelho para ver o carimbo.")).toBeVisible();
});

test("carimbo seco: sem violação estrutural de acessibilidade (axe), com selo e ímãs abertos", async ({ page }) => {
  await openApp(page);
  await go(page, "Carimbo seco");
  await page.getByRole("button", { name: "Convite de casamento" }).click();
  await page.getByText("Opções avançadas").click();
  await idle(page);
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
