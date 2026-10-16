import AxeBuilder from "@axe-core/playwright";
import { expect, go, openApp, settleColors, test } from "./tauri";

// "Foto em relevo" abre numa escolha de tipo; o Como usar aparece na tela do gerador escolhido
const TOOLS = ["Imagem em desenho (SVG)", "Cortador de biscoito", "Chaveiros", "Medalhas", "Carimbo seco", "Caixinha termoformada", "Desenho em 3D", "QR Code e Pix", "Etiquetas de rolo", "Pixel art", "Separar cores de um 3MF", "Nome ou logo no seu modelo", "Corte parcial"];

test("toda ferramenta com tela própria tem o bloco Como usar (quando usar, dicas e perguntas) (#209)", async ({ page }) => {
  test.slow();
  await openApp(page);
  for (const label of TOOLS) {
    await go(page, label);
    const help = page.locator("details.gen-help").first();
    await expect(help, label).toBeAttached({ timeout: 30_000 });
    await help.locator("summary").first().click();
    await expect(help.getByText("Quando usar"), label).toBeVisible();
    await expect(help.getByText("Perguntas frequentes"), label).toBeVisible();
  }
  // Organizadores abre numa escolha de jeito: o Como usar aparece no organizador de gaveta
  await go(page, "Organizador de gaveta");
  await page.locator("details.gen-help summary").first().click();
  await expect(page.locator("details.gen-help").getByText(/Organizar uma gaveta/)).toBeVisible();
  await page.locator(".export-tips summary").click();
  await expect(page.locator(".export-tips").getByText(/Comece por um exemplo/)).toBeVisible();
});

test("Modelos prontos: as variações viram 'Comece pelo uso' com frase e o Como usar traz a ajuda da família e a tabela dos campos", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Topo de bolo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Topo de bolo/ }).first().click();
  const bar = page.getByRole("group", { name: "Variações prontas" });
  await expect(bar.getByRole("button", { name: "Casamento" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comece pelo uso" })).toBeVisible();
  await bar.getByRole("button", { name: "Casamento" }).click();
  await expect(bar.getByRole("button", { name: "Casamento" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Preenche os campos com o exemplo "Casamento"/)).toBeVisible();
  const help = page.locator("details.gen-help").first();
  await help.locator("summary").first().click();
  await expect(help.getByText("Quando não usar")).toBeVisible();
  await expect(help.getByRole("table")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`Como usar aberto numa ferramenta e num modelo: sem violação de acessibilidade (${scheme})`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await go(page, "Chaveiros");
    await page.locator("details.gen-help summary").first().click();
    await settleColors(page);
    const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

test("QR no tema escuro: a prévia vazia segue o tema (o branco só aparece atrás do QR pronto)", async ({ page }) => {
  test.slow();
  await page.emulateMedia({ colorScheme: "dark" });
  await openApp(page);
  await go(page, "QR Code e Pix");
  const preview = page.locator(".qr-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toHaveAttribute("data-ready", "");
  const bg = await preview.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
});

test("Dicas de impressão aparecem uma vez só e a tabela do Como usar não tem coluna Dica vazia", async ({ page }) => {
  test.slow();
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Topo de bolo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Topo de bolo/ }).first().click();
  const help = page.locator("details.gen-help").first();
  await help.locator("summary").first().click();
  await expect(help.getByText("Dicas de impressão")).toHaveCount(0);
  await expect(page.locator(".export-tips")).toHaveCount(1);
  await expect(help.getByRole("columnheader", { name: "Dica" })).toHaveCount(0);
  // a tabela cabe na caixa (sem passar da borda)
  const fits = await help.locator(".gen-help-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});
