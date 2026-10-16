import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const PRINTS = process.env.TROFEU_PRINTS;
async function shot(page: Page, name: string) {
  if (!PRINTS) return;
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}${process.env.TROFEU_SUFFIX ?? ""}.png` });
}
async function open(page: Page, label: string) {
  await pickModel(page, "troféu", label, { exact: true });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test("troféu atleta: esportes prontos, troca de esporte e 3MF", async ({ page, tauri }) => {
  await open(page, "Troféu atleta");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3); // atleta, base e texto da base
  await shot(page, "01-atleta-futebol");
  await page.getByRole("button", { name: "Natação" }).click();
  await idle(page);
  await shot(page, "02-atleta-natacao");
  await page.getByRole("button", { name: "Prata" }).click();
  await idle(page);
  await shot(page, "03-atleta-prata");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

test("troféu escultura: fita, estrela e cruz torcidas", async ({ page }) => {
  await open(page, "Troféu escultura");
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await shot(page, "04-escultura-fita");
  await page.getByRole("button", { name: "Estrela prateada" }).click();
  await idle(page);
  await shot(page, "05-escultura-estrela");
  await page.getByRole("button", { name: "Cruz bronze" }).click();
  await idle(page);
  await shot(page, "06-escultura-cruz");
});

const assembled = (page: Page) => page.getByRole("button", { name: "Montada (não imprime)" }).click().then(() => idle(page));
const onTable = (page: Page) => page.getByRole("button", { name: "Mesa (o que imprime)" }).click().then(() => idle(page));

test("troféu atleta: Mesa mostra o que imprime e Montado mostra o troféu em pé na base", async ({ page }) => {
  await open(page, "Troféu atleta");
  const size = async () => (await hud(page).textContent()) ?? "";
  const flat = await size();
  await assembled(page);
  expect(await size()).not.toBe(flat);
  await shot(page, "07-atleta-futebol-montado");
  for (const [sport, file] of [["Basquete", "08-atleta-basquete-montado"], ["Vôlei", "09-atleta-volei-montado"], ["Natação", "10-atleta-natacao-montado"]] as const) {
    await page.getByLabel("Esporte", { exact: true }).selectOption({ label: sport }); // a variação pronta zera a prévia: troca pelo campo
    await idle(page);
    await shot(page, file);
  }
  await onTable(page);
});

test("troféu: com a prévia montada o 3MF salvo é o mesmo da mesa (sempre na posição de impressão)", async ({ page, tauri }) => {
  await open(page, "Troféu atleta");
  // salvar com a prévia montada: o 3MF é o mesmo da mesa (o montado é só prévia)
  // o zip tem datas dentro: compara o modelo (as malhas e as posições), não os bytes
  await assembled(page);
  const threeMf = () => [...tauri.files.entries()].filter(([k]) => k.endsWith(".3mf")).map(([, v]) => strFromU8(unzipSync(v as Uint8Array)["3D/3dmodel.model"]).replace(/UUID="[^"]*"|<metadata[^>]*>[^<]*<\/metadata>/gi, ""));
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const fromAssembled = threeMf();
  expect(fromAssembled).toHaveLength(1);
  await onTable(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect.poll(() => threeMf()[0]).toBe(fromAssembled[0]);
});

test("troféu atleta: 58 esportes, em ordem alfabética, e os novos saem na mesa e montados", async ({ page }) => {
  await open(page, "Troféu atleta");
  const sport = page.getByLabel("Esporte", { exact: true });
  const labels = await sport.locator("option").allTextContents();
  expect(labels).toHaveLength(58);
  expect([...labels].sort((a, b) => a.localeCompare(b, "pt-BR"))).toEqual(labels);
  await assembled(page);
  for (const [label, file] of [["Salto em altura", "14-atleta-salto-em-altura"], ["Judô", "15-atleta-judo"], ["Hipismo", "16-atleta-hipismo"], ["Surfe", "17-atleta-surfe"]] as const) {
    await sport.selectOption({ label });
    await idle(page);
    await expect(page.locator(".viewer .legend")).toContainText("Atleta");
    await shot(page, file);
  }
});

test("troféu escultura montada: fita, estrela e cruz em pé na base", async ({ page }) => {
  await open(page, "Troféu escultura");
  await assembled(page);
  await shot(page, "11-escultura-fita-montada");
  await page.getByRole("button", { name: "Estrela", exact: true }).click();
  await idle(page);
  await shot(page, "12-escultura-estrela-montada");
  await page.getByRole("button", { name: "Cruz", exact: true }).click();
  await idle(page);
  await shot(page, "13-escultura-cruz-montada");
});

test("troféu: a família mostra as variações Atleta e Escultura", async ({ page }) => {
  await open(page, "Troféu atleta");
  await expect(page.getByRole("button", { name: "Escultura", exact: true }).first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`troféu escultura: sem violação de acessibilidade (axe), tema ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const l of ["Troféu atleta", "Troféu escultura"] as const) {
      await open(page, l);
      const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
      expect(r.violations.map((v) => `${l}: ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    }
  });
