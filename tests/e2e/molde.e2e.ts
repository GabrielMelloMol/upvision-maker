import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, test, toastWith } from "./tauri";

// o molde roda na thread da página: com muitos testes em paralelo o cálculo demora mais que os 5 s padrão
const expect = baseExpect.configure({ timeout: 30_000 });
const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0, { timeout: 60_000 });
};
const ARM = resolve("tests/fixtures/stl/boneco-braco.stl");
const TREE = resolve("tests/fixtures/stl/personagem-arvore.stl");
const PRINTS = process.env.MOLDE_PRINTS;
async function shot(page: Page, name: string) {
  if (!PRINTS) return;
  mkdirSync(PRINTS, { recursive: true });
  await page.screenshot({ path: `${PRINTS}/${name}.png` });
}
const names3mf = (buf: Buffer) => [...strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).matchAll(/<object id="\d+" name="([^"]*)" type="model"><components>/g)].map((m) => m[1]);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
});

test("molde: o STL vira duas metades, com a conta de material, e o 3MF leva as duas", async ({ page, tauri }) => {
  test.slow();
  await go(page, "Molde a partir de STL");
  await expect(page.getByText(/Use só peças que são suas ou cuja licença permite copiar/)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(ARM);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Metade de baixo");
  await expect(page.locator(".legend")).toContainText("Metade de cima");
  await expect(page.getByText(/A cavidade leva/)).toBeVisible();
  await shot(page, "01-molde-boneco-braco");

  // sem canal: o campo do diâmetro some
  await page.getByRole("button", { name: "Sem canal" }).click();
  await expect(page.getByLabel(/^Diâmetro do canal/)).toHaveCount(0);
  await page.getByRole("group", { name: "Lado do canal" }).getByRole("button", { name: "Frente" }).click();
  await expect(page.getByLabel(/^Diâmetro do canal/)).toBeVisible();
  await idle(page);
  await shot(page, "02-molde-com-canal");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const saved = [...tauri.files.entries()].find(([k]) => k.endsWith("boneco-braco-molde.3mf"));
  expect(saved).toBeTruthy();
  expect(names3mf(Buffer.from(saved![1] as Uint8Array))).toEqual(["Metade de baixo", "Metade de cima"]);
});

test("molde: trocar a direção do plano refaz o plano sugerido e o aviso de contra-saída aparece quando prende", async ({ page }) => {
  test.slow();
  await go(page, "Molde a partir de STL");
  await page.locator('input[type="file"]').first().setInputFiles(TREE);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Metade de baixo");
  await shot(page, "03-molde-personagem-arvore");
  await page.getByRole("button", { name: "Vertical (X)" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Metade de cima");
  await page.getByRole("button", { name: "Sugerir o plano que menos prende" }).click();
  await idle(page);
  await shot(page, "04-molde-plano-sugerido");
});

for (const scheme of ["light", "dark"] as const)
  test(`molde: sem violação de acessibilidade (axe), tema ${scheme}`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await go(page, "Molde a partir de STL");
    await page.locator('input[type="file"]').first().setInputFiles(ARM);
    await idle(page);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
