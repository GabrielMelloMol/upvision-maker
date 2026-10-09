import AxeBuilder from "@axe-core/playwright";
import { openRelief } from "./relief";
import { expect, go, openApp, test } from "./tauri";

/**
 * Foto em relevo: Litofania + Colorida + Relevo + Quadro por camadas + Shadowbox numa ferramenta só, com uma escolha
 * inicial. Nada se perde: o id da página e os rascunhos são os de sempre e os atalhos antigos levam à aba certa.
 */
const chooser = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "O que você quer fazer?" });
const tab = (page: import("@playwright/test").Page, name: string) => page.getByRole("group", { name: "Tipo" }).getByRole("button", { name, exact: true });

test("começa perguntando o que fazer; escolher abre a aba e dá para trocar entre as cinco", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Foto em relevo");
  await expect(page.getByRole("heading", { name: "Foto em relevo", level: 1 })).toBeVisible();
  await expect(chooser(page).getByRole("button")).toHaveCount(5);
  await chooser(page).getByRole("button", { name: /^Relevo/ }).click();
  await expect(chooser(page)).toHaveCount(0);
  await expect(tab(page, "Relevo")).toHaveAttribute("aria-pressed", "true");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByLabel(/^Profundidade/)).toBeVisible();
  for (const name of ["Litofania", "Colorida", "Quadro por camadas"]) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-pressed", "true");
  }
  await tab(page, "Shadowbox").click();
  await expect(page.getByRole("heading", { name: "Shadowbox (placas empilhadas)", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Modelos prontos" })).toHaveCount(0);
});

test("atalho antigo leva à aba certa: a busca ⌘K por shadowbox", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Início");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("shadowbox");
  // o modelo entra na busca quando o catálogo termina de carregar: espera por ele (a tela "Foto em relevo" também cita o Shadowbox e aparece antes)
  await page.locator("#pal-model-shadowbox").click();
  await expect(page.getByRole("heading", { name: "Foto em relevo", level: 1 })).toBeVisible();
  await expect(tab(page, "Shadowbox")).toHaveAttribute("aria-pressed", "true");
  // o modelo é o mesmo de sempre: salva 3MF pela aba
  await expect(page.getByRole("button", { name: /Salvar 3MF/ })).toBeVisible({ timeout: 60_000 });
});

test("rascunho e Meus projetos continuam abrindo a ferramenta (o id da página não mudou)", async ({ page, tauri }) => {
  test.slow();
  await openApp(page);
  await openRelief(page, "Relevo");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByLabel(/^Profundidade/)).toBeVisible();
  await expect.poll(() => (tauri.db.prepare("SELECT data FROM tool_state WHERE id = 'lithophane'").get() as { data?: string } | undefined)?.data ?? "", { timeout: 30_000 }).toContain("\"mode\":\"relief\"");
  await page.reload();
  await go(page, "Foto em relevo");
  // a escolha inicial aparece junto com o rascunho guardado, que continua de onde parou na mesma aba
  await expect(chooser(page)).toBeVisible();
  await page.getByRole("button", { name: "Continuar de onde parou" }).click();
  await expect(tab(page, "Relevo")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^Profundidade/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`escolha inicial legível e sem estourar a tela (${scheme}, ${width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await go(page, "Foto em relevo");
      await expect(chooser(page).getByRole("button")).toHaveCount(5);
      const axe = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)).toBe(false);
      for (const b of await chooser(page).getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await chooser(page).getByRole("button", { name: /^Shadowbox/ }).click();
      await expect(page.getByRole("heading", { name: "Shadowbox (placas empilhadas)", level: 2 })).toBeVisible({ timeout: 60_000 });
      const axe2 = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe2.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
