import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/**
 * Organizadores (gaveta, foto das ferramentas e Gridfinity avulso numa ferramenta só): a escolha inicial, as abas e os caminhos antigos.
 */
const envelope = (state: object) => JSON.stringify({ v: 1, state });
const DRAWER_DRAFT = envelope({ width: 321, depth: 222, height: 55, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: { cols: 0, rows: 0, modules: [] } });

const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const LOAD = { timeout: 60_000 }; // a ferramenta de dentro carrega sob demanda (3D e fontes): com a máquina em carga passa de 15 s

test("escolha inicial: três pontos de partida, cada um abre a aba com a ferramenta", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Criar");
  // a galeria Criar mostra uma ferramenta só
  await page.getByRole("link", { name: /^Organizadores/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Organizadores" })).toBeVisible();
  const choices = page.getByRole("list", { name: "Como organizar" });
  await expect(choices.getByRole("button")).toHaveCount(3);

  await choices.getByRole("button", { name: /^Tenho a medida da gaveta/ }).click();
  await expect(tab(page, "Pela medida da gaveta")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel(/^Largura/)).toBeVisible(LOAD);

  await tab(page, "Pela foto das ferramentas").click();
  await expect(page.locator(".photo-step input[type=file]")).toBeAttached(LOAD);

  await tab(page, "Caixinhas avulsas").click();
  const variants = page.getByRole("group", { name: "Variação" });
  await expect(variants.getByRole("button")).toHaveText([/Caixinha/, /Base/, /Base gaveta/, /Teste encaixe/]);
  await variants.getByRole("button", { name: /Base gaveta/ }).click();
  await expect(variants.getByRole("button", { name: /Base gaveta/ })).toHaveAttribute("aria-pressed", "true");

  // a última aba fica lembrada; "Ver as opções" volta à escolha
  await go(page, "Início");
  await go(page, "Criar");
  await page.getByRole("link", { name: /^Organizadores/ }).click();
  await expect(tab(page, "Caixinhas avulsas")).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Ver as opções" }).click();
  await expect(page.getByRole("list", { name: "Como organizar" })).toBeVisible();
});

test("os nomes e caminhos antigos levam à aba certa: busca ⌘K e atalho da família Gridfinity", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await expect(tab(page, "Pela medida da gaveta")).toHaveAttribute("aria-selected", "true");
  await go(page, "Organizador pela foto");
  await expect(tab(page, "Pela foto das ferramentas")).toHaveAttribute("aria-selected", "true");
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("gridfinity");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Gridfinity: caixinha" }).click();
  // os atalhos "Na gaveta" e "Pela foto" da família abrem as abas
  await page.getByRole("button", { name: "Na gaveta" }).click();
  await expect(tab(page, "Pela medida da gaveta")).toHaveAttribute("aria-selected", "true");
});

test("rascunho salvo no Organizador de gaveta continua em Meus projetos e abre na aba da gaveta com as medidas", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Início"); // cria o banco
  tauri.db.exec(`INSERT INTO tool_state (id, data, updatedAt) VALUES ('drawer', '${DRAWER_DRAFT}', '2026-10-09T10:00:00Z')`);
  await go(page, "Meus projetos");
  const draft = page.getByRole("list", { name: "Projetos" }).getByRole("button", { name: "Abrir Rascunho de Organizador de gaveta" });
  await expect(draft).toBeVisible();
  await draft.click();
  await expect(tab(page, "Pela medida da gaveta")).toHaveAttribute("aria-selected", "true", LOAD);
  await expect(page.getByLabel(/^Largura/)).toHaveValue("321", LOAD);
  await expect(page.getByLabel(/^Profundidade/)).toHaveValue("222");
});

test("a ajuda (?) é a da aba aberta", async ({ page }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await expect(page.getByRole("button", { name: "Ajuda: Organizador de gaveta" })).toBeVisible();
  await tab(page, "Caixinhas avulsas").click();
  await page.getByRole("button", { name: "Ajuda: Organizadores" }).click();
  await expect(page.getByRole("dialog", { name: "Organizadores" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of [{ name: "larga", width: 1280, height: 800 }, { name: "estreita", width: 900, height: 600 }]) {
    test.describe(`${scheme} · ${size.name}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });

      test("a escolha e as abas não transbordam e passam no axe, com contraste", async ({ page }) => {
        test.slow();
        await openApp(page);
        await go(page, "Criar");
        await page.getByRole("link", { name: /^Organizadores/ }).click();
        const check = async (label: string) => {
          const sideScroll = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1);
          expect(sideScroll, `${label}: a página rola para o lado`).toBe(false);
          const r = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), `${label}: axe`).toEqual([]);
        };
        await expect(page.getByRole("list", { name: "Como organizar" })).toBeVisible();
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/organizadores-escolha-${scheme}-${size.name}.png` });
        await check("escolha");
        await page.getByRole("list", { name: "Como organizar" }).getByRole("button", { name: /^Tenho a medida/ }).click();
        await expect(page.getByLabel(/^Largura/)).toBeVisible(LOAD);
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/organizadores-gaveta-${scheme}-${size.name}.png` });
        await check("aba da gaveta");
        await tab(page, "Caixinhas avulsas").click();
        await expect(page.getByRole("group", { name: "Variação" })).toBeVisible();
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/organizadores-caixinhas-${scheme}-${size.name}.png` });
        await check("aba das caixinhas");
      });
    });
  }
}
