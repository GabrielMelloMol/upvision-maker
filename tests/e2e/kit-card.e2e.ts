import AxeBuilder from "@axe-core/playwright";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
/** Silhueta cheia de uma "fuselagem" (lateral) e de uma vista de cima alta (não cabe no cartão de crédito), em SVG. */
const SIDE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 24"><path d="M0 0H90L100 12L90 24H0Z"/></svg>';
const TOP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><path d="M0 70L50 0L100 70L50 140Z"/></svg>';

test("kit card: uma imagem vira cartão com peças de encaixe e pontos de corte; segunda imagem cruza; prévia montada só na tela (#193)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Kit card");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Kit card (montar)", exact: true }).click();
  await idle(page);
  const inputs = page.locator('input[type="file"]');
  await inputs.first().setInputFiles({ name: "lateral.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SIDE) });
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Cartão");
  await expect(page.locator(".legend")).toContainText("Peças");
  await expect(page.locator(".legend")).toContainText("Título");
  await expect(page.locator(".legend")).toContainText("Montado: lateral");
  await expect(page.getByText(/Para montar: destaque as peças/)).toBeVisible();
  const width = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[0]);
  // cartão médio (120 mm) + a prévia montada ao lado
  await expect.poll(width, { timeout: 60_000 }).toBeGreaterThan(150);

  // segunda imagem: vista de cima, que cruza a lateral
  await inputs.nth(1).setInputFiles({ name: "cima.svg", mimeType: "image/svg+xml", buffer: Buffer.from(TOP) });
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Montado: vista de cima");
  await expect(page.getByText(/cruze a vista de cima na lateral pelas fendas/)).toBeVisible();

  // ajustes: folga da fenda, espessura (1,2 a 2 mm) e tamanho do cartão
  await page.getByLabel(/^Folga da fenda/).fill("0.3");
  await page.getByLabel(/^Espessura do cartão e das peças/).fill("1.2");
  await idle(page);
  await page.getByRole("button", { name: /Cartão de crédito/ }).click();
  await idle(page);
  await expect(page.getByText(/não cabem neste cartão com tamanho útil/)).toBeVisible(); // 2 imagens no cartão de crédito: pede um cartão maior
  await page.getByRole("button", { name: /Grande \(180/ }).click();
  await idle(page);
  await expect(page.getByText(/não cabem neste cartão/)).toHaveCount(0);

  // o arquivo leva só o cartão: o modelo montado é só prévia
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const xml = strFromU8(unzipSync(new Uint8Array([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]))["3D/3dmodel.model"]);
  expect(xml).not.toContain("Montado");
  expect(xml).toContain("Cartão");

  // a tela do kit card (com os dois envios de imagem) também passa no axe
  const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
