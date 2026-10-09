import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("mapa estelar de uma data: céu de São Paulo na noite de Natal, outra cidade, data inválida e ímã (#106)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("estelar");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Mapa estelar de uma data/ }).first().click();
  await idle(page);
  // placa de 120 mm de largura (a altura, 156 mm, mais o suporte de mesa dá 196 mm), placa e estrelas em 2 cores
  await expect(hud(page)).toContainText("120.0 × 196.0", { timeout: 60_000 });
  await expect(page.locator(".viewer .legend")).toContainText("Estrelas");
  await expect(page.getByText(/\d+ estrelas visíveis \(até a magnitude 4.5\) no céu de São Paulo/)).toBeVisible();

  // outra cidade, pela busca: o aviso acompanha
  await page.getByLabel("Cidade ou endereço").fill("londres");
  await page.getByRole("group", { name: "Lugares encontrados" }).getByRole("button", { name: /^Londres/ }).first().click();
  await idle(page);
  await expect(page.getByText(/no céu de Londres/)).toBeVisible();

  // 30 de fevereiro não existe
  await page.getByRole("spinbutton", { name: "Mês" }).fill("2");
  await page.getByRole("spinbutton", { name: "Dia" }).fill("30");
  await expect(page.getByText(/Esse dia não existe nesse mês/)).toBeVisible();
  await page.getByRole("spinbutton", { name: "Dia" }).fill("14");
  await idle(page);
  await expect(page.getByText(/no céu de Londres/)).toBeVisible();

  // linhas das constelações: ligadas por padrão, dá para desligar e ligar de novo
  const lines = page.getByRole("switch", { name: "Linhas das constelações" });
  await expect(lines).toBeChecked();
  await lines.uncheck();
  await idle(page);
  await expect(lines).not.toBeChecked();
  await lines.check();
  await idle(page);
  await expect(hud(page)).toContainText("120.0 ×");

  // ímã atrás: aviso do encaixe
  await page.getByRole("group", { name: "Apoio" }).getByRole("button", { name: "Ímã atrás" }).click();
  await idle(page);
  await expect(page.getByText(/Encaixe um ímã de 10 mm por 2 mm/)).toBeVisible();
});

async function openStarMap(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("estelar");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Mapa estelar de uma data/ }).first().click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
}

const setDate = async (page: Page, v: { day: string; month: string; year: string; hour: string }) => {
  for (const [name, value] of [["Dia", v.day], ["Mês", v.month], ["Ano", v.year], ["Hora", v.hour]] as const) await page.getByRole("spinbutton", { name: new RegExp(`^${name}`) }).fill(value);
};

test("mapa estelar (#196): cidade pequena do interior pelo nome e fuso do horário de verão conferido na tela", async ({ page }) => {
  test.slow(); // a prévia 3D refaz o céu a cada mudança; sob carga passa de 60 s
  await openStarMap(page);
  await page.getByLabel("Cidade ou endereço").fill("Santa Rita do Passa Quatro");
  await page.getByRole("group", { name: "Lugares encontrados" }).getByRole("button", { name: /^Santa Rita do Passa Quatro, SP/ }).click();
  await idle(page);
  await expect(page.getByText(/no céu de Santa Rita do Passa Quatro, SP/)).toBeVisible();
  await expect(page.getByLabel("Latitude")).toHaveValue("-21.7083");

  // São Paulo, 15/01/2010 22:00: horário de verão (UTC−2); em julho, UTC−3
  await page.getByLabel("Cidade ou endereço").fill("sao paulo");
  await page.getByRole("group", { name: "Lugares encontrados" }).getByRole("button", { name: /^São Paulo, SP/ }).first().click();
  await setDate(page, { day: "15", month: "1", year: "2010", hour: "22" });
  await idle(page);
  await expect(page.getByText(/fuso America\/Sao_Paulo · UTC−2 \(horário de verão\)/)).toBeVisible();
  await page.getByRole("spinbutton", { name: /^Mês/ }).fill("7");
  await idle(page);
  await expect(page.getByText(/fuso America\/Sao_Paulo · UTC−3, automático/)).toBeVisible();

  // fuso manual: desligando o automático, vale o digitado
  await page.getByRole("switch", { name: "Fuso e horário de verão automáticos" }).uncheck();
  await expect(page.getByText(/fuso manual UTC−3/)).toBeVisible();
});

test("mapa estelar (#196): endereço completo pela internet (OpenStreetMap), com atribuição, e sem internet cai na cidade da lista", async ({ page }) => {
  let calls = 0;
  await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
    calls++;
    if (calls === 1)
      return route.fulfill({
        json: [{ lat: "-22.9056", lon: "-47.0608", display_name: "Rua Barão de Jaguara, 1000, Centro, Campinas, São Paulo, Brasil", name: "", address: { city: "Campinas", state: "São Paulo", "ISO3166-2-lvl4": "BR-SP", country_code: "br" } }],
        headers: { "access-control-allow-origin": "*" },
      });
    return route.abort("internetdisconnected");
  });
  await openStarMap(page);
  await page.getByLabel("Cidade ou endereço").fill("Rua Barão de Jaguara 1000 Campinas");
  await page.getByRole("button", { name: "Buscar endereço pela internet" }).click();
  const results = page.getByRole("group", { name: "Endereços encontrados" });
  await results.getByRole("button", { name: /Rua Barão de Jaguara, 1000/ }).click();
  await expect(results).toHaveCount(0);
  await idle(page);
  await expect(page.getByText(/no céu de Campinas, SP/)).toBeVisible();
  await expect(page.getByLabel("Latitude")).toHaveValue("-22.9056");
  await page.getByLabel("Cidade ou endereço").fill("Av Paulista 1000 São Paulo");
  await page.getByRole("button", { name: "Buscar endereço pela internet" }).click();
  await expect(page.getByText(/Use a cidade da lista/)).toBeVisible({ timeout: 20_000 });
  // a atribuição aparece junto dos resultados da internet
  await page.getByLabel("Cidade ou endereço").fill("Rua Barão de Jaguara 1000 Campinas");
  await page.getByRole("button", { name: "Buscar endereço pela internet" }).click();
  await expect(page.getByText(/colaboradores do OpenStreetMap/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 640] as const)
    test(`mapa estelar (#196): campo de lugar legível e sem estourar a tela (${scheme}, ${width}px)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openStarMap(page);
      await page.getByLabel("Cidade ou endereço").fill("santa rita");
      await expect(page.getByRole("group", { name: "Lugares encontrados" })).toBeVisible();
      const axe = await new AxeBuilder({ page }).include(".place-field").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1)).toBe(false);
      for (const b of await page.locator(".place-results button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    });
