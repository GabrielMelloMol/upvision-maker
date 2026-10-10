import AxeBuilder from "@axe-core/playwright";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
/** Silhueta cheia de uma "fuselagem" (lateral) e uma vista de cima alta (não cabe no cartão de crédito), em SVG. */
const SIDE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 24"><path d="M0 0H90L100 12L90 24H0Z"/></svg>';
const TOP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><path d="M0 70L50 0L100 70L50 140Z"/></svg>';

/** PNG de uma "foto" 160 × 100: fundo branco liso e um objeto escuro (elipse) no meio, para o recorte por cor. */
function photoPng(): Buffer {
  const [w, h] = [160, 100];
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = ((x - 80) / 55) ** 2 + ((y - 50) / 28) ** 2 <= 1;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = raw[o + 1] = raw[o + 2] = inside ? 30 : 250;
    }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function openKit(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Kit card");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Kit card (montar)", exact: true }).click();
  await idle(page);
}

test("kit card, figura/animal: peças inteiras no cartão fino com o nome gravado, costelas, 2 laterais, segunda imagem e 3MF sem o montado (#193)", async ({ page, tauri }) => {
  await openKit(page);
  const inputs = page.locator('input[type="file"]');
  await inputs.first().setInputFiles({ name: "lateral.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SIDE) });
  await idle(page);
  // a legenda mostra as 6 primeiras partes
  for (const name of ["Cartão", "Peças", "Título", "Montado: base", "Montado: lateral 1", "Montado: lateral 2"]) await expect(page.locator(".legend")).toContainText(name);
  await expect(page.getByText(/desça cada costela/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Figura ou animal" })).toHaveAttribute("aria-pressed", "true");
  const width = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[0]);
  await expect.poll(width, { timeout: 60_000 }).toBeGreaterThan(190); // cartão grande (180) + o montado ao lado

  // ajustes: costelas, largura máxima, placas laterais, folga da fenda, espessura (1,2 a 2 mm) e tamanho do cartão
  await page.getByLabel(/^Número de costelas/).fill("8");
  await page.getByLabel(/^Largura máxima/).fill("55");
  await page.getByLabel(/^Placas laterais/).fill("1");
  await page.getByLabel(/^Folga da fenda/).fill("0.3");
  await page.getByLabel(/^Espessura do cartão e das peças/).fill("1.2");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Montado: lateral");
  await expect(page.locator(".legend")).not.toContainText("Montado: lateral 2");

  // segunda imagem (vista de cima): a largura das costelas vem dela; no cartão de crédito não cabe e o app diz
  await inputs.nth(1).setInputFiles({ name: "cima.svg", mimeType: "image/svg+xml", buffer: Buffer.from(TOP) });
  await idle(page);
  await page.getByRole("button", { name: /Cartão de crédito/ }).click();
  await idle(page);
  await expect(page.getByText(/não cabem neste cartão com tamanho útil/)).toBeVisible();
  await page.getByRole("button", { name: /Grande \(180/ }).click();
  await idle(page);
  await expect(page.getByText(/não cabem neste cartão/)).toHaveCount(0);

  // o arquivo leva só o cartão: o modelo montado é só prévia
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const xml = strFromU8(unzipSync(new Uint8Array([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]))["3D/3dmodel.model"]);
  expect(xml).not.toContain("Montado");
  expect(xml).toContain("Cartão");
});

test("kit card, veículo: laterais + chassi + 4 rodas com pneu em outra cor, folga do eixo e vários cartões por mesa (#193)", async ({ page, tauri }) => {
  await openKit(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name: "lateral.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SIDE) });
  await idle(page);
  await page.getByRole("button", { name: "Veículo" }).click();
  await idle(page);
  for (const name of ["Cartão", "Peças", "Rodas", "Pneus", "Título", "Montado: chassi"]) await expect(page.locator(".legend")).toContainText(name);
  await expect(page.getByText(/prenda as 4 rodas apertando o eixo/)).toBeVisible();
  await expect(page.getByLabel(/^Número de costelas/)).toHaveCount(0); // a seção da figura some no modo veículo
  await page.getByLabel(/^Folga do eixo no furo/).fill("0.25");
  await page.getByLabel(/^Espessura do pneu/).fill("0");
  await idle(page);
  await expect(page.locator(".legend")).not.toContainText("Pneus");
  await page.getByLabel(/^Espessura do pneu/).fill("2");
  await page.getByRole("button", { name: /Médio \(120/ }).click();
  await page.getByLabel(/^Cartões na mesa/).fill("4");
  await idle(page);
  await expect(page.getByText(/não cabem neste cartão/)).toHaveCount(0);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const xml = strFromU8(unzipSync(new Uint8Array([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]))["3D/3dmodel.model"]);
  expect(xml).not.toContain("Montado");
  expect(xml).toContain("Rodas");
});

test("kit card: foto com fundo liso é recortada (e o recorte pode ser desligado depois do envio); a tela passa no axe (#193)", async ({ page }) => {
  await openKit(page);
  const toggle = page.getByRole("switch", { name: "Recortar o fundo da foto" });
  await expect(toggle).toBeChecked();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: photoPng() });
  await expect(page.getByText(/Recortando o fundo/)).toHaveCount(0, { timeout: 90_000 });
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Peças"); // a elipse da foto virou a silhueta
  await toggle.uncheck(); // vale também para a foto já enviada: vetoriza de novo sem recortar
  await expect(page.getByText(/Recortando o fundo/)).toHaveCount(0, { timeout: 90_000 });
  await idle(page);
  await expect(toggle).not.toBeChecked();
  const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
