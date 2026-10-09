import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, prefsSection, test } from "./tauri";

const SECTIONS = ["Custos da produção", "Preço de venda", "Falhas, impostos e custos fixos", "Canais de venda", "Aparência", "Seus dados", "Ferramentas"];
const nav = (page: Page) => page.getByRole("navigation", { name: "Seções das Preferências" });
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
};

test("preferências em seções (#179): lista à esquerda, um painel por vez, lembra a última e leva ao erro", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await go(page, "Preferências");
  await expect(nav(page).getByRole("button")).toHaveText(SECTIONS);
  await expect(nav(page).getByRole("button", { name: "Custos da produção" })).toHaveAttribute("aria-current", "page");
  await shot(page, "preferencias-custos");

  // lista ao lado do painel, não em cima
  const list = await nav(page).boundingBox();
  const field = await page.getByLabel("Preço do kWh").boundingBox();
  expect(list!.x + list!.width).toBeLessThan(field!.x);

  // só o painel da seção aparece
  await expect(page.getByLabel("Preço do kWh")).toBeVisible();
  await expect(page.getByLabel("Margem mínima (%)")).toBeHidden();
  await prefsSection(page, "Preço de venda");
  await expect(page.getByLabel("Margem mínima (%)")).toBeVisible();
  await expect(page.getByLabel("Preço do kWh")).toBeHidden();

  // teclado: Tab chega na lista e Enter troca de seção
  await nav(page).getByRole("button", { name: "Canais de venda" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Adicionar canal" })).toBeVisible();
  await expect(nav(page).getByRole("button", { name: "Canais de venda" })).toHaveAttribute("aria-current", "page");

  // lembra a última seção ao voltar à tela
  await go(page, "Início");
  await go(page, "Preferências");
  await expect(nav(page).getByRole("button", { name: "Canais de venda" })).toHaveAttribute("aria-current", "page");

  // erro em outra seção: salvar leva até ela e a lista marca com texto
  await prefsSection(page, "Preço de venda");
  await page.getByLabel("Multiplicador para lojista / revenda (×)").fill("abc");
  await prefsSection(page, "Ferramentas");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByText("Digite um número.")).toBeVisible();
  await expect(nav(page).getByRole("button", { name: /Preço de venda/ })).toHaveAttribute("aria-current", "page");
  await expect(nav(page).getByText("Corrigir")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`preferências em seções (#179): sem violação de acessibilidade nem contraste, ${scheme === "light" ? "claro" : "escuro"}`, async ({ page }) => {
    test.setTimeout(3 * 60_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await go(page, "Preferências");
    const found: string[] = [];
    for (const name of SECTIONS) {
      await prefsSection(page, name);
      await page.waitForTimeout(300);
      await shot(page, `preferencias-${name.split(" ")[0].toLowerCase()}-${scheme}`);
      const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      for (const v of r.violations) found.push(`${name} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    }
    expect(found, "violações do axe").toEqual([]);
  });
}

test("preferências em seções (#179): em janela estreita a lista vira uma faixa e a página não rola para o lado", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await openApp(page);
  await go(page, "Preferências");
  const first = await nav(page).getByRole("button", { name: "Custos da produção" }).boundingBox();
  const second = await nav(page).getByRole("button", { name: "Preço de venda" }).boundingBox();
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(4); // mesma linha: faixa horizontal
  const body = await page.getByLabel("Preço do kWh").boundingBox();
  expect(body!.y).toBeGreaterThan(first!.y + first!.height); // o painel vem abaixo da faixa
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth + 1)).toBe(true);
  await shot(page, "preferencias-estreita");
  // as outras seções continuam alcançáveis (a faixa rola)
  await nav(page).getByRole("button", { name: "Ferramentas" }).scrollIntoViewIfNeeded();
  await prefsSection(page, "Ferramentas");
  await expect(page.getByRole("heading", { name: /Inteligência artificial/ })).toBeVisible();
});
