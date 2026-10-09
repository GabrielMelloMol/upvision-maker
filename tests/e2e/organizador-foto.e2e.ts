import { resolve } from "node:path";
import jpeg from "jpeg-js";
import { renderScene, type Scene } from "../../src/organizer/photo/testPhoto";
import { expect, go, openApp, test, toastWith } from "./tauri";

test("organizador pela foto: ferramentas de exemplo com medida, Gridfinity em 3D e salvar 3MF (#169)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Organizador pela foto");
  await expect(page.getByRole("img", { name: /Chave de fenda: 190 × 26 mm/ })).toBeVisible();
  await page.getByRole("button", { name: "Gridfinity", exact: true }).click();
  await expect(page.getByText(/Caixa Gridfinity de \d+×\d+ casas/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("organizador-gridfinity.3mf"))).toBe(true);
});

// foto realista (tests/fixtures/organizador/gerar.py --sombra 0.3): celular com zoom 2x a 56 cm, 9° inclinado, barril,
// sombra suave, ruído e JPEG. Medidas reais da base: chave de boca 155 × 34, argola 97,4 × 46, chave de fenda 182 × 28.
const REAL: [number, number][] = [
  [155, 34],
  [97.4, 46],
  [182, 28],
];

// a mesma foto em JPEG e em HEIC (sips -s format heic, como o iPhone/AirDrop manda): o Chromium não abre HEIC, então
// este caso passa pelo decodificador WASM e pela focal do EXIF de dentro do HEIC
for (const ext of ["jpg", "heic"])
test(`organizador pela foto: dicas de como fotografar, foto realista (${ext}) medida a menos de 2 mm e o contorno numerado em cima dela (#169)`, async ({ page }) => {
  test.setTimeout(120_000); // decodificar e medir a foto leva alguns segundos
  await openApp(page);
  await go(page, "Organizador pela foto");
  const tips = page.getByRole("list", { name: "Como fotografar" });
  await expect(tips).toContainText("De longe, com zoom 2x");
  await expect(tips).toContainText("Boa luz, sem sombra");
  await page.locator(".photo-step input[type=file]").setInputFiles(resolve(`tests/fixtures/organizador/ferramentas-a4-celular.${ext}`));
  await expect(page.getByRole("button", { name: "Canto 1 da folha (setas movem)" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
  await page.getByLabel("Altura das ferramentas").fill("8");
  await page.getByLabel("Altura das ferramentas").blur();
  await expect(page.getByRole("img", { name: /Contornos medidos na folha de (210 × 297|297 × 210) mm/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".photo-found .tool-num")).toHaveCount(3);
  await expect(page.getByLabel(/Comprimento real da Ferramenta 1/)).toHaveCount(0); // focal lida do EXIF: sem régua
  const items = await page.getByRole("list", { name: "Medidas" }).getByRole("listitem").allInnerTexts();
  const sizes = items.map((t) => [...t.matchAll(/(\d+,\d) × (\d+,\d)/g)][0].slice(1).map((n) => Number(n.replace(",", "."))));
  sizes.forEach(([l, w], i) => {
    expect(Math.abs(l - REAL[i][0]), `comprimento da ferramenta ${i + 1}`).toBeLessThan(2);
    expect(Math.abs(w - REAL[i][1]), `largura da ferramenta ${i + 1}`).toBeLessThan(2);
  });
});

test("organizador pela foto: altura 0 avisa com exemplos; óculos com 40 mm sugerem encaixe de 24 mm com Usar (#169)", async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await go(page, "Organizador pela foto");
  await page.locator(".photo-step input[type=file]").setInputFiles(resolve("tests/fixtures/organizador/ferramentas-a4-celular.jpg"));
  await expect(page.getByRole("button", { name: "Canto 1 da folha (setas movem)" })).toBeVisible({ timeout: 60_000 });
  const missing = page.getByText(/Falta a altura das ferramentas/);
  await expect(missing).toBeVisible();
  await expect(missing).toContainText("óculos dobrados ~40 mm");
  await page.getByLabel("Altura das ferramentas").fill("40");
  await page.getByLabel("Altura das ferramentas").blur();
  await expect(missing).toHaveCount(0);
  await expect(page.getByText(/A ferramenta mais alta tem 40 mm e o encaixe 12 mm: 28 mm ficam para fora/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Usar 24 mm" }).click();
  await expect(page.getByRole("spinbutton", { name: /^Profundidade/ })).toHaveValue("24");
  await expect(page.getByText(/16 mm ficam para fora/)).toBeVisible();
  await expect(page.getByText(/A peça fica com 26 mm de altura/)).toBeVisible();
});

test("organizador pela foto: mesa branca sem borda avisa, destaca os cantos e mostra a lupa ao arrastar (#169)", async ({ page }) => {
  test.setTimeout(120_000);
  // folha branca numa mesa do mesmo tom, sem sombra: não dá para achar a folha sozinho
  const scene: Scene = { sheet: { w: 210, h: 297 }, boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }], camera: [160, 330, 420], target: [105, 150, 0], focalPx: 1300, size: [1600, 1200], roll: 8, table: { tone: 233 } };
  const img = renderScene(scene, 2);
  const buffer = Buffer.from(jpeg.encode({ data: Buffer.from(img.data.buffer), width: img.width, height: img.height }, 92).data);
  await openApp(page);
  await go(page, "Organizador pela foto");
  await page.locator(".photo-step input[type=file]").setInputFiles({ name: "mesa-branca.jpg", mimeType: "image/jpeg", buffer });
  await expect(page.getByText(/use a folha de medição/)).toBeVisible({ timeout: 60_000 });
  const corner = page.getByRole("button", { name: "Canto 1 da folha (setas movem)" });
  await expect(corner).toHaveClass(/low/);
  await page.locator(".photo-corners").scrollIntoViewIfNeeded();
  const box = (await corner.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
  await expect(page.locator(".corner-lens")).toBeVisible();
  if (process.env.SHOTS) await page.locator(".photo-corners").screenshot({ path: process.env.SHOTS });
  await page.mouse.up();
  await expect(page.locator(".corner-lens")).toHaveCount(0);
});

test("organizador pela foto: gaveta modular com uma caixinha Gridfinity por ferramenta, mapa arrastável e uma mesa por 3MF (#169)", async ({ page, tauri }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await go(page, "Organizador pela foto");
  await page.getByRole("button", { name: "Gaveta", exact: true }).click();
  await page.getByRole("button", { name: "Caixinhas", exact: true }).click();
  const map = page.getByRole("img", { name: /Gaveta com 9 × 7 casas de 42 mm, frente embaixo; 3 caixinhas/ });
  await expect(map).toBeVisible();
  // espera a peça terminar de gerar: os avisos que chegam com ela empurram o mapa para baixo (o arraste erraria o alvo)
  const card = page.getByLabel("Impressão por mesa");
  await expect(card.getByRole("row", { name: /Caixinha Chave de fenda \d+×\d+×\d+/ })).toBeVisible({ timeout: 120_000 });
  // arrastar com o mouse a caixinha mais ao fundo uma casa para trás (no mapa, o fundo fica em cima)
  const bins = page.getByRole("button", { name: /^Caixinha \d / });
  const labels = await bins.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!));
  const pos = labels.map((l) => {
    const [, , h] = /(\d+)×(\d+) casas/.exec(l)!.map(Number);
    const [, , row] = /coluna (\d+), fileira (\d+)/.exec(l)!.map(Number);
    return { l, h, top: row - 1 + h };
  });
  const back = pos.reduce((a, b) => (b.top > a.top ? b : a));
  expect(back.top).toBeLessThan(7); // sobra fileira atrás
  const bin = page.getByRole("button", { name: back.l });
  await bin.scrollIntoViewIfNeeded(); // o mapa fica embaixo do 3D, na coluna que rola sozinha
  const box = (await bin.boundingBox())!;
  const cell = box.height / back.h;
  // começa no meio da fileira de baixo da caixinha (o centro pode cair bem na divisa de duas fileiras)
  const startY = box.y + box.height - cell / 2;
  await page.mouse.move(box.x + box.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, startY - cell, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: back.l })).toHaveCount(0);
  await expect(page.getByRole("button", { name: back.l.replace(/fileira (\d+)/, (_, r) => `fileira ${Number(r) + 1}`) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Arrumar de novo sozinho" })).toBeVisible();
  // impressão (refeita com a caixinha no lugar novo): base em pedaços + caixinhas, cada mesa num 3MF
  await expect(card.getByRole("row", { name: /Caixinha Chave de fenda \d+×\d+×\d+/ })).toBeVisible({ timeout: 120_000 });
  await expect(card.getByRole("row", { name: /^Base/ }).first()).toBeVisible();
  tauri.nextOpen = "/pasta";
  await card.getByRole("button", { name: "Salvar todas as mesas numa pasta" }).click();
  await expect(page.locator(".toast", { hasText: /mesas salvas em \/pasta/ })).toBeVisible();
  expect([...tauri.files.keys()].filter((p) => p.startsWith("/pasta/organizador-gaveta-mesa-")).length).toBeGreaterThan(1);
});
