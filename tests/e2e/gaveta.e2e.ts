import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const objects3mf = (buf: Buffer) => (strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).match(/<object id="\d+" name="[^"]*" type="model"><components>/g) ?? []).length;

const names3mf = (buf: Buffer) => [...strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).matchAll(/<object id="\d+" name="([^"]*)" type="model"><components>/g)].map((m) => m[1]);

/** Arrasta da casa (c0, r0) até (c1, r1); fileira 0 é a da frente (embaixo no desenho). */
async function dragCells(page: Page, cols: number, rows: number, from: [number, number], to: [number, number]) {
  const svg = page.locator("svg.drawer-editor");
  const b = (await svg.boundingBox())!;
  const cw = b.width / cols, ch = b.height / rows;
  const at = ([c, r]: [number, number]) => [b.x + (c + 0.5) * cw, b.y + b.height - (r + 0.5) * ch] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 4 });
  await page.mouse.up();
}

test("organizador de gaveta: 4 × 3 casas, 3 caixinhas desenhadas, ajuste e exportação (#140)", async ({ page, tauri }) => {
  test.slow(); // prévia 3D pesada: com a máquina em carga passa de 60 s (sozinho, ~5 s)
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Organizador de gaveta");
  for (const [label, v] of [["Largura", "169"], ["Profundidade", "127"], ["Altura livre", "60"]] as const) await page.getByLabel(new RegExp(`^${label}`)).fill(v);
  await expect(page.getByText(/Cabem 4 × 3 casas.*A base sai em 1 pedaço\./)).toBeVisible();
  // gaveta 3D ao vivo: o campo em foco acende a cota dele, com o número digitado
  await page.getByLabel(/^Largura/).focus();
  await expect(page.locator('.drawer-dim[data-dim="width"][data-focus]')).toHaveText("169 mm");
  await expect(page.locator('.drawer-dim[data-dim="depth"]')).not.toHaveAttribute("data-focus");
  await page.getByLabel(/^Altura livre/).focus();
  await expect(page.locator('.drawer-dim[data-dim="height"][data-focus]')).toHaveText("60 mm");
  if (SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/gaveta-3d-${scheme}.png`, fullPage: true });
    }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Grade", exact: true }).click();
  await dragCells(page, 4, 3, [0, 0], [1, 0]); // 2×1 na frente à esquerda
  await expect(page.getByRole("heading", { name: "Caixinha 2×1" })).toBeVisible();
  await page.getByLabel("Etiqueta (texto)").fill("Pregos");
  await dragCells(page, 4, 3, [2, 0], [2, 1]); // 1×2
  await dragCells(page, 4, 3, [0, 2], [3, 2]); // 4×1 no fundo
  const mods = page.getByRole("button", { name: /^Caixinha \d×\d, altura/ });
  await expect(mods).toHaveCount(3);
  // teclado: a do fundo desce não dá (tem a 1×2 embaixo na coluna 2); duplica a 2×1 com ⌘D
  await page.getByRole("button", { name: /^Caixinha 2×1, altura 3, coluna 1, fileira 1, etiqueta Pregos/ }).focus();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(mods).toHaveCount(4);
  await page.keyboard.press("Delete");
  await expect(mods).toHaveCount(3);
  if (SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400); // transição do tema
      await page.screenshot({ path: `${SHOTS}/gaveta-${scheme}.png`, fullPage: true });
    }
  // organizador montado dentro da gaveta
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Gaveta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver montado" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Peças", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("168.0 × 126.0", { timeout: 90_000 });
  await expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 90_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  // base + 3 caixinhas + etiqueta
  expect(objects3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1])).toBe(5);

  // impressão por mesa: lista com a caixinha e a base, e um 3MF por mesa numa pasta
  const card = page.getByLabel("Impressão por mesa");
  await expect(card.getByRole("row", { name: /Caixinha 2×1×3 Pregos/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /^Base/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /Total/ })).toContainText(" g");
  await expect(card.getByText(/^Mesa 1/)).toBeVisible();
  tauri.nextOpen = "/pasta";
  await card.getByRole("button", { name: "Salvar todas as mesas numa pasta" }).click();
  await expect(page.locator(".toast", { hasText: /(mesa salva|mesas salvas) em \/pasta/ })).toBeVisible();
  const plates = [...tauri.files.keys()].filter((p) => p.startsWith("/pasta/gaveta-mesa-"));
  expect(plates.length).toBeGreaterThanOrEqual(1);
  expect(objects3mf(tauri.files.get(plates[0])!)).toBeGreaterThanOrEqual(1);
});

test("sem régua em casa: régua 1:1 em PDF e régua 3D de 25 cm (#140)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await page.getByRole("button", { name: "Régua em papel (PDF)" }).click();
  await expect(toastWith(page, "regua-1-1.pdf")).toBeVisible();
  expect(tauri.files.get("/saida/regua-1-1.pdf")!.subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "Régua 3D (25 cm)" }).click();
  await expect(toastWith(page, "regua-25cm.3mf")).toBeVisible({ timeout: 30_000 });
  expect(objects3mf(tauri.files.get("/saida/regua-25cm.3mf")!)).toBe(1);
});

test("talheres em 2 andares: bandeja nos trilhos em cima, base e caixinhas embaixo, peças na lista (#140)", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Organizador de gaveta");
  for (const [label, v] of [["Largura", "500"], ["Profundidade", "500"], ["Altura livre", "110"]] as const) await page.getByLabel(new RegExp(`^${label}`)).fill(v);
  await page.getByRole("switch", { name: "Dois andares: talheres em cima" }).check();
  await expect(page.getByText(/Cabem 11 × 11 casas/)).toBeVisible();
  await expect(page.getByText(/A bandeja desliza para o fundo nos trilhos/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("group", { name: /bandeja de talheres em cima, deslizando nos trilhos/ })).toBeVisible();
  if (SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(1600); // transição do tema + animação da montagem
      await page.screenshot({ path: `${SHOTS}/talheres-${scheme}.png`, fullPage: true });
    }
  const card = page.getByLabel("Impressão por mesa");
  await expect(card.getByRole("row", { name: /Bandeja de talheres/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /Trilho esquerdo 1/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /Teste do trilho/ })).toBeVisible();
  // gaveta rasa: a bandeja fica removível
  await page.getByLabel(/^Profundidade/).fill("420");
  await expect(page.getByText(/levanta pelas alças/)).toBeVisible({ timeout: 90_000 });
});

/** Sugestão real (#194): gaveta de "35 × 25" digitada em centímetros num campo em milímetros. */
test("gaveta 35 × 25 digitada em cm: avisa a faixa em mm e cm, sugere 350 × 250 mm e gera com um clique", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Organizador de gaveta");
  const largura = page.getByLabel(/^Largura/), profundidade = page.getByLabel(/^Profundidade/);
  await largura.fill("35");
  await profundidade.fill("25");
  await expect(page.getByText("Use entre 50 e 1.500 mm (5 e 150 cm).").first()).toBeVisible();
  await expect(page.getByText("Você quis dizer 35 cm (350 mm)?")).toBeVisible();
  await expect(page.getByText("Você quis dizer 25 cm (250 mm)?")).toBeVisible();
  await page.getByRole("button", { name: "Usar 350 mm" }).click();
  await page.getByRole("button", { name: "Usar 250 mm" }).click();
  await expect(largura).toHaveValue("350");
  await expect(profundidade).toHaveValue("250");
  await expect(page.getByText("= 35 cm")).toBeVisible();
  await expect(page.getByText("= 25 cm")).toBeVisible();
  await expect(page.getByText(/Cabem \d+ × \d+ casas/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`aviso de medida em cm legível e sem estourar a tela (${scheme}, ${width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await go(page, "Organizador de gaveta");
      await page.getByLabel(/^Largura/).fill("35");
      await expect(page.getByText("Você quis dizer 35 cm (350 mm)?")).toBeVisible();
      const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe.violations.filter((v) => !/drawer|viewer/.test(JSON.stringify(v.nodes.map((n) => n.target)))).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      const wide = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1);
      expect(wide).toBe(false);
      const btn = await page.getByRole("button", { name: "Usar 350 mm" }).boundingBox();
      expect(btn!.height).toBeGreaterThanOrEqual(24);
    });

test("dois andares: o 3MF leva o andar de baixo (base + caixinhas) e o de cima (bandeja + trilhos)", async ({ page, tauri }) => {
  test.slow();
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Organizador de gaveta");
  for (const [label, v] of [["Largura", "500"], ["Profundidade", "420"], ["Altura livre", "110"]] as const) await page.getByLabel(new RegExp(`^${label}`)).fill(v);
  await page.getByRole("switch", { name: "Dois andares: talheres em cima" }).check();
  await expect(page.getByText(/Cabem 11 × 9 casas/)).toBeVisible();
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Grade", exact: true }).click();
  await dragCells(page, 11, 9, [0, 0], [1, 1]); // caixinha 2×2 no andar de baixo
  await expect(page.getByRole("heading", { name: "Caixinha 2×2" })).toBeVisible();
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Peças", exact: true }).click();
  await expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 90_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const names = names3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]);
  expect(names.filter((n) => /^Base/.test(n)).length).toBeGreaterThanOrEqual(1);
  expect(names.filter((n) => /^Caixinha 2×2/.test(n))).toHaveLength(1);
  expect(names.filter((n) => /^(Bandeja|Trilho)/.test(n)).length).toBeGreaterThanOrEqual(4);
});

test("dois andares com gaveta baixa (60 mm): avisa o mínimo em mm e cm ao lado da opção", async ({ page }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  for (const [label, v] of [["Largura", "400"], ["Profundidade", "400"], ["Altura livre", "60"]] as const) await page.getByLabel(new RegExp(`^${label}`)).fill(v);
  await page.getByRole("switch", { name: "Dois andares: talheres em cima" }).check();
  await expect(page.getByText(/Dois andares não cabem.*60 mm \(6 cm\).*80 mm \(8 cm\).*faltam 20 mm \(2 cm\)/)).toBeVisible();
});
