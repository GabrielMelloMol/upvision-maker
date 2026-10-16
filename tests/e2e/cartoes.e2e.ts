import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

/** Os cartões de família da Criar e da galeria, os resultados da busca e do ⌘K têm que abrir o modelo daquele cartão. */
const model = (page: Page) => page.locator("[data-model]");
const opened = async (page: Page) => (await model(page).first().getAttribute("data-model")) ?? "";

test("Criar: cada cartão de produto abre o modelo ou a ferramenta do próprio cartão (todas as categorias)", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  await go(page, "Criar");
  const cards = page.locator(".create-products a");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  expect(total).toBeGreaterThan(40); // 38 famílias + 4 ferramentas que também são produto
  const wrong: string[] = [];
  for (let i = 0; i < total; i++) {
    await go(page, "Criar");
    const card = page.locator(".create-products a").nth(i);
    const href = (await card.getAttribute("href"))!;
    const family = await card.getAttribute("data-product");
    const variants = ((await card.getAttribute("data-variants")) ?? "").split(",").filter(Boolean);
    const want = href.replace("#models/", "").replace("#", "");
    if (href.startsWith("#models/") && !variants.includes(want)) wrong.push(`${family}: o cartão aponta para ${want}, que não é do produto`);
    await card.click();
    await page.waitForSelector("main h1", { timeout: 15_000 });
    if (!href.startsWith("#models/")) continue; // ferramenta: a tela abriu (tem título)
    // o que virou aba de outra ferramenta (Shadowbox) abre lá; o resto abre nos Modelos prontos, no modelo do cartão
    if (want === "shadowbox") {
      if (!(await page.getByRole("heading", { name: "Litofania", level: 1 }).isVisible())) wrong.push(`${family}: shadowbox não abriu a Litofania`);
      continue;
    }
    await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
    const got = await opened(page);
    if (got !== want) wrong.push(`${family}: esperava ${want}, abriu ${got}`);
  }
  expect(wrong, "cartões que abriram o lugar errado").toEqual([]);
});

test("Criar: cada resultado de ocasião e de busca abre o modelo clicado", async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await openApp(page);
  await go(page, "Criar");
  const wrong: string[] = [];
  const clickAll = async (label: string, max = 2) => {
    const n = Math.min(max, await page.locator(".create-products a").count());
    for (let i = 0; i < n; i++) {
      await go(page, "Criar"); // a Criar volta com o mesmo filtro
      const a = page.locator(".create-products a").nth(i);
      const href = (await a.getAttribute("href"))!;
      if (!href.startsWith("#models/")) continue;
      const want = href.replace("#models/", "");
      await a.click();
      if (want === "shadowbox") continue;
      await model(page).first().waitFor();
      const got = await opened(page);
      if (got !== want) wrong.push(`${label}: esperava ${want}, abriu ${got}`);
    }
    return n;
  };
  // todas as ocasiões (as escondidas aparecem em "Mais")
  const chips = () => page.getByRole("group", { name: "Ocasião" });
  await expect(chips().getByRole("button").first()).toBeVisible();
  if (await chips().getByRole("button", { name: /^Mais \(/ }).count()) await chips().getByRole("button", { name: /^Mais \(/ }).click();
  const occasions = (await chips().getByRole("button").allTextContents()).filter((t) => t !== "Menos" && !/Favoritos/.test(t));
  expect(occasions.length).toBe(13);
  let total = 0;
  for (const o of occasions) {
    await go(page, "Criar");
    if (await chips().getByRole("button", { name: /^Mais \(/ }).count()) await chips().getByRole("button", { name: /^Mais \(/ }).click();
    await chips().getByRole("button", { name: o, exact: true }).click();
    total += await clickAll(`ocasião ${o}`);
    await go(page, "Criar");
    if (await chips().getByRole("button", { name: /^Mais \(/ }).count()) await chips().getByRole("button", { name: /^Mais \(/ }).click();
    await chips().getByRole("button", { name: o, exact: true }).click(); // desliga
  }
  expect(total).toBeGreaterThan(25);
  for (const q of ["mapa", "tecla", "geladeira", "abajur", "dado", "porta copos", "camiseta", "natal", "gridfinity", "placa", "chaveiro"]) {
    await go(page, "Criar");
    await page.getByRole("searchbox", { name: "O que você quer criar?" }).fill(q);
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

/** Atalhos de ocasião (cartão "Para o Dia das Mães…" da Início e da Criar): abrem a coleção e um modelo que está nela. */
const OCASIOES: [Date, string][] = [
  [new Date(2026, 3, 20, 10), "Dia das Mães"], [new Date(2026, 2, 10, 10), "Páscoa"], [new Date(2026, 5, 1, 10), "Festa Junina"],
  [new Date(2026, 6, 20, 10), "Dia dos Pais"], [new Date(2026, 9, 5, 10), "Dia das Crianças"], [new Date(2026, 11, 1, 10), "Natal"],
];
for (const [date, nome] of OCASIOES)
  for (const onde of ["Início", "Criar"] as const)
    test(`cartão da ocasião ${nome} (${onde}) abre a Criar na coleção e um modelo dela`, async ({ page }) => {
      await page.clock.setFixedTime(date);
      await openApp(page);
      if (onde === "Criar") await go(page, "Criar");
      await page.getByRole("button", { name: new RegExp(`Para .*${nome}`) }).click();
      const chips = page.getByRole("group", { name: "Ocasião" });
      await expect(chips.getByRole("button").first()).toBeVisible();
      if (await chips.getByRole("button", { name: /^Mais \(/ }).count()) await chips.getByRole("button", { name: /^Mais \(/ }).click();
      await expect(chips.getByRole("button", { name: nome, exact: true })).toHaveAttribute("aria-pressed", "true");
      const card = page.locator(".create-products a").first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      const variants = ((await card.getAttribute("data-variants")) ?? "").split(",");
      await card.click();
      await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
      expect(variants, `modelos do cartão da coleção ${nome}`).toContain(await opened(page));
    });

test("Veja também e atalhos das famílias: cada um abre o destino do próprio rótulo", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await openApp(page);
  // Veja também das ferramentas
  await go(page, "Litofania");
  await page.locator(".relief-cards button").first().click(); // escolhe Litofania; o Veja também aparece depois da escolha
  await page.getByRole("button", { name: "Litofania em abajur" }).first().click();
  await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
  expect(await opened(page)).toBe("tableLamp");
  await go(page, "Litofania");
  await page.locator(".relief-cards button").first().click();
  await page.getByRole("button", { name: "Pixel art" }).first().click();
  await expect(page.getByRole("heading", { name: "Pixel art", level: 1 })).toBeVisible();
  await go(page, "Chaveiros");
  await page.getByRole("button", { name: /Chaveiros prontos/ }).click();
  await expect(model(page).first()).toBeVisible({ timeout: 15_000 });
  expect(await opened(page)).toBe("nfc");
  await go(page, "Chaveiros");
  await page.getByRole("button", { name: "Medalhas" }).first().click();
  await expect(page.getByRole("heading", { name: "Medalhas", level: 1 })).toBeVisible();

  // atalhos das famílias (os cartões de outra ferramenta dentro de "Variação")
  const DESTINOS: Record<string, string> = { "Nome em lote": "Chaveiros", Redonda: "Medalhas", "QR Code e Pix": "QR Code e Pix", Biscoito: "Cortador de biscoito", "Na gaveta": "Organizadores", "Pela foto": "Organizadores", Pixel: "Pixel art", Carimbo: "Carimbo seco" };
  // as famílias que têm atalho para outra ferramenta (a Medalha abre a própria ferramenta, sem seletor)
  const wrong: string[] = [];
  let used = 0;
  for (const family of ["keychain", "counterPlate", "stamps", "cutters", "gridfinity"]) {
    await go(page, "Criar");
    await page.getByRole("searchbox", { name: "O que você quer criar?" }).fill("");
    await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Tudo", exact: true }).click();
    await page.locator(`.create-products a[data-product="${family}"]`).click();
    await model(page).first().waitFor();
    const n = await page.locator(".model-variant-tool").count();
    expect(n, `${family}: atalhos`).toBeGreaterThan(0);
    for (let j = 0; j < n; j++) {
      if (j > 0) {
        await go(page, "Criar");
        await page.locator(`.create-products a[data-product="${family}"]`).click();
        await model(page).first().waitFor();
      }
      const shortcut = page.locator(".model-variant-tool").nth(j);
      const label = ((await shortcut.locator(".model-variant-label").textContent()) ?? "").trim();
      const want = Object.entries(DESTINOS).find(([k]) => label.startsWith(k))?.[1];
      await shortcut.click();
      await page.waitForSelector("main h1");
      used++;
      const got = (await page.locator("main h1").first().textContent())?.trim();
      if (!want) wrong.push(`${family}: atalho "${label}" sem destino conhecido (abriu ${got})`);
      else if (got !== want) wrong.push(`${family}: atalho "${label}": esperava ${want}, abriu ${got}`);
    }
  }
  expect(used).toBeGreaterThanOrEqual(6);
  expect(wrong).toEqual([]);
});
