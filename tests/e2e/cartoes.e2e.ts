import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/** Os cartões de família da Criar e da galeria, os resultados da busca e do ⌘K têm que abrir o modelo daquele cartão. */
const model = (page: Page) => page.locator("[data-model]");
const opened = async (page: Page) => (await model(page).first().getAttribute("data-model")) ?? "";

test("Criar: cada cartão de modelo pronto abre o modelo do próprio cartão (todas as categorias)", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  await go(page, "Criar");
  const cards = page.locator(".create-models a");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(25);
  const wrong: string[] = [];
  for (let i = 0; i < total; i++) {
    await go(page, "Criar");
    const card = page.locator(".create-models a").nth(i);
    const want = (await card.getAttribute("href"))!.replace("#models/", "");
    const variants = ((await card.getAttribute("data-variants")) ?? "").split(",");
    const family = await card.getAttribute("data-family");
    if (!variants.includes(want)) wrong.push(`${family}: o cartão aponta para ${want}, que não é da família`);
    await card.click();
    // o que virou aba de outra ferramenta (Shadowbox) abre lá; o resto abre nos Modelos prontos, no modelo do cartão
    await page.waitForSelector("main h1", { timeout: 15_000 });
    const tab = want === "shadowbox";
    if (tab) {
      if (!(await page.getByRole("heading", { name: "Foto em relevo", level: 1 }).isVisible())) wrong.push(`${family}: shadowbox não abriu a Foto em relevo`);
      continue;
    }
    await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
    const got = await opened(page);
    if (got !== want) wrong.push(`${family}: esperava ${want}, abriu ${got}`);
  }
  expect(wrong, "cartões que abriram o modelo errado").toEqual([]);
});

test("galeria dos Modelos prontos: cada cartão de família, em cada categoria, abre a família dele", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  await go(page, "Modelos prontos");
  const tabs = page.getByRole("group", { name: "Categoria" });
  await expect(tabs.getByRole("button").first()).toBeVisible();
  const names = await tabs.getByRole("button").allTextContents();
  expect(names).toHaveLength(7);
  const wrong: string[] = [];
  let seen = 0;
  for (const name of names) {
    await tabs.getByRole("button", { name, exact: true }).click();
    const families = page.getByRole("group", { name: "Família" }).locator("button");
    const n = await families.count();
    expect(n, name).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = page.getByRole("group", { name: "Família" }).locator("button").nth(i);
      const family = await card.getAttribute("data-family");
      const variants = ((await card.getAttribute("data-variants")) ?? "").split(",");
      await card.click();
      seen++;
      await expect(card).toHaveAttribute("aria-pressed", "true");
      const got = await opened(page);
      if (!variants.includes(got)) wrong.push(`${name} › ${family}: abriu ${got}, que não é da família (${variants.join(",")})`);
      // a aba continua a da família clicada
      await expect(tabs.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
  }
  expect(seen).toBeGreaterThan(25);
  expect(wrong, "cartões que abriram a família errada").toEqual([]);
});

test("galeria: cada resultado de ocasião e de busca abre o modelo clicado", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  await go(page, "Modelos prontos");
  const wrong: string[] = [];
  const clickAll = async (label: string) => {
    const buttons = page.getByRole("group", { name: "Modelo" }).locator("button[data-id]");
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const b = page.getByRole("group", { name: "Modelo" }).locator("button[data-id]").nth(i);
      const want = (await b.getAttribute("data-id"))!;
      await b.click();
      const got = await opened(page);
      if (got !== want) wrong.push(`${label}: esperava ${want}, abriu ${got}`);
    }
    return n;
  };
  // todas as ocasiões (as escondidas aparecem em "Mais")
  const chips = page.getByRole("group", { name: "Ocasião" });
  await expect(chips.getByRole("button").first()).toBeVisible();
  if (await chips.getByRole("button", { name: /^Mais \(/ }).count()) await chips.getByRole("button", { name: /^Mais \(/ }).click();
  const occasions = (await chips.getByRole("button").allTextContents()).filter((t) => t !== "Menos" && !/Favoritos/.test(t));
  expect(occasions.length).toBe(13);
  let total = 0;
  for (const o of occasions) {
    await chips.getByRole("button", { name: o, exact: true }).click();
    total += await clickAll(`ocasião ${o}`);
    await chips.getByRole("button", { name: o, exact: true }).click(); // desliga
  }
  expect(total).toBeGreaterThan(50);
  for (const q of ["mapa", "tecla", "geladeira", "abajur", "dado", "porta copos", "camiseta", "natal", "gridfinity", "placa", "chaveiro"]) {
    await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(q);
    expect(await clickAll(`busca ${q}`), q).toBeGreaterThan(0);
  }
  expect(wrong, "resultados que abriram o modelo errado").toEqual([]);
});

test("⌘K: cada Modelo pronto achado abre o modelo do resultado", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  const wrong: string[] = [];
  let checked = 0;
  for (const q of ["mapa estelar", "tecla", "geladeira", "abajur", "dado", "porta copos", "camiseta", "natal", "gridfinity", "pix", "cartão de música", "marca página", "cumbuca", "suporte de celular", "ímã", "troféu"]) {
    await go(page, "Início");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Buscar" });
    await palette.getByRole("combobox").fill(q);
    const option = palette.locator('[role="option"][id^="pal-model-"]').first();
    await expect(option, q).toBeVisible();
    const want = (await option.getAttribute("id"))!.replace("pal-model-", "");
    await option.click();
    await page.waitForSelector("main h1");
    if (want === "shadowbox") continue;
    await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
    const got = await opened(page);
    checked++;
    if (got !== want) wrong.push(`⌘K ${q}: esperava ${want}, abriu ${got}`);
  }
  expect(checked).toBeGreaterThan(12);
  expect(wrong, "resultados do ⌘K que abriram o modelo errado").toEqual([]);
});
