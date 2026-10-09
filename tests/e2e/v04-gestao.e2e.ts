import { resolve } from "node:path";
import { expect, go, openApp, test, toastWith } from "./tauri";

const fixture = (name: string) => resolve("tests/fixtures/slicer", name);
const settingsOf = (db: { prepare: (q: string) => { get: () => unknown } }) => JSON.parse((db.prepare("SELECT data FROM settings WHERE id = 1").get() as { data: string }).data);

test("impressoras: catálogo busca, navega com setas, Enter preenche nome e potência", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByRole("button", { name: "Adicionar impressora" }).click();
  await page.getByRole("button", { name: "Escolher do catálogo" }).click();
  const sheet = page.getByRole("dialog", { name: "Catálogo de impressoras" });
  const search = sheet.getByRole("combobox", { name: "Buscar no catálogo" });
  await search.fill("bambu a1");
  const options = sheet.getByRole("option");
  await expect(options).toHaveCount(2); // A1 e A1 mini, na ordem do catálogo
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "cat-bambu-a1-mini");
  await search.press("ArrowDown"); // dá a volta
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowUp");
  await search.press("Enter");

  await expect(sheet).toBeHidden();
  await expect(toastWith(page, "Preenchido com o catálogo")).toBeVisible();
  await expect(page.getByLabel("Nome")).toHaveValue("Bambu Lab A1 mini");
  await expect(page.getByLabel("Potência média (W)")).toHaveValue("80");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("row", { name: /Bambu Lab A1 mini/ })).toContainText("80");
  expect(tauri.db.prepare("SELECT name, watts FROM printers").all()).toEqual([{ name: "Bambu Lab A1 mini", watts: 80 }]);
});

test("impressoras: catálogo sem resultado oferece cadastrar à mão", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByRole("button", { name: "Adicionar impressora" }).click();
  await page.getByRole("button", { name: "Escolher do catálogo" }).click();
  const sheet = page.getByRole("dialog", { name: "Catálogo de impressoras" });
  await sheet.getByRole("combobox", { name: "Buscar no catálogo" }).fill("minha caseira");
  await expect(sheet.getByText("Nada encontrado — digite do seu jeito")).toBeVisible();
  await expect(sheet.getByText("Nenhum item do catálogo tem “minha caseira”.")).toBeVisible();
  await expect(sheet.getByRole("option")).toHaveCount(0);
  await sheet.getByRole("combobox", { name: "Buscar no catálogo" }).press("Enter"); // sem resultado, Enter não faz nada
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Cadastrar à mão" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel("Nome")).toHaveValue("");
  expect(tauri.db.prepare("SELECT COUNT(*) AS n FROM printers").get()).toEqual({ n: 0 });
});

test("apresentação: passo 2 escolhe a impressora do catálogo e grava", async ({ page, tauri }) => {
  await openApp(page, { keepOnboarding: true });
  const welcome = page.getByRole("dialog", { name: "Boas-vindas ao UpVision Maker" });
  await welcome.getByRole("button", { name: "Continuar" }).click();
  await expect(welcome.getByText("Passo 2 de 3")).toBeVisible();
  await welcome.getByRole("button", { name: "Escolher do catálogo" }).click();
  const sheet = page.getByRole("dialog", { name: "Catálogo de impressoras" });
  await sheet.getByRole("combobox", { name: "Buscar no catálogo" }).fill("k1 max");
  await expect(sheet.getByRole("option")).toHaveCount(1);
  await sheet.getByRole("combobox", { name: "Buscar no catálogo" }).press("Enter");
  await expect(sheet).toBeHidden();
  await expect(welcome).toBeVisible(); // escolher no catálogo não fecha nem avança a apresentação
  await expect(welcome.getByText("Passo 2 de 3")).toBeVisible();
  await expect(welcome.getByLabel("Nome")).toHaveValue("Creality K1 Max");
  await expect(welcome.getByLabel("Potência média (W)")).toHaveValue("180");
  await welcome.getByRole("button", { name: "Continuar" }).click();
  await expect(welcome.getByText("Passo 3 de 3")).toBeVisible();
  expect(tauri.db.prepare("SELECT name, watts FROM printers").all()).toEqual([{ name: "Creality K1 Max", watts: 180 }]);
});

test("preferências: kWh pela conta de luz com bandeira atualiza o campo, salva e guarda o histórico", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Preferências");
  await page.getByRole("button", { name: "Calcular pela conta de luz" }).click();
  const sheet = page.getByRole("dialog", { name: "Calcular pela conta de luz" });
  await expect(sheet.getByRole("button", { name: "Usar este valor" })).toBeDisabled();
  await sheet.getByLabel("Valor total da conta").fill("276");
  await sheet.getByLabel("kWh consumidos").fill("300");
  // 276 ÷ 300 = R$ 0,92
  await expect(sheet.getByRole("button", { name: /^Usar R\$\s0,92\/kWh$/ })).toBeVisible();
  await sheet.getByRole("group", { name: "Bandeira" }).getByRole("button", { name: "Amarela" }).click();
  await expect(sheet.getByRole("group", { name: "Bandeira" }).getByRole("button", { name: "Amarela" })).toHaveAttribute("aria-pressed", "true");
  // + 0,01885 da bandeira amarela = 0,93885 → R$ 0,94
  await sheet.getByRole("button", { name: /^Usar R\$\s0,94\/kWh$/ }).click();
  await expect(sheet).toBeHidden();
  await expect(toastWith(page, "Preço do kWh atualizado")).toContainText("R$ 0,94");
  await expect(page.getByLabel("Preço do kWh")).toHaveValue("0,94");

  const month = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const history = [{ month, total: 276, kwh: 300, flag: "amarela", price: 0.94 }];
  expect(settingsOf(tauri.db)).toMatchObject({ kwhPrice: 0.94, kwhHistory: history });

  // salvar o resto das preferências não apaga o histórico nem volta o kWh
  await page.getByLabel("Manutenção (%)").fill("7");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(toastWith(page, "Preferências salvas.")).toBeVisible();
  expect(settingsOf(tauri.db)).toMatchObject({ kwhPrice: 0.94, maintenancePct: 7, kwhHistory: history });

  await go(page, "Início");
  await go(page, "Preferências");
  await expect(page.getByLabel("Preço do kWh")).toHaveValue("0,94");
  await page.getByRole("button", { name: "Calcular pela conta de luz" }).click();
  const list = page.getByRole("list", { name: "Cálculos anteriores" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Amarela");
  await expect(list).toContainText("R$ 0,94/kWh");
});

test("preferências: conta de luz com valores trocados avisa que está fora do comum", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Preferências");
  await page.getByRole("button", { name: "Calcular pela conta de luz" }).click();
  const sheet = page.getByRole("dialog", { name: "Calcular pela conta de luz" });
  await sheet.getByLabel("Valor total da conta").fill("300");
  await sheet.getByLabel("kWh consumidos").fill("50"); // R$ 6,00/kWh
  await expect(sheet.getByText(/Valor fora do comum/)).toBeVisible();
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByLabel("Preço do kWh")).toHaveValue("0,90");
});

test("filamentos: catálogo preenche marca/material/rolo e Duplicar abre novo cadastro sem a cor", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Filamentos");
  await page.getByRole("button", { name: "Adicionar filamento" }).click();
  await page.getByRole("button", { name: "Escolher do catálogo" }).click();
  const sheet = page.getByRole("dialog", { name: "Catálogo de filamentos" });
  await sheet.getByRole("combobox", { name: "Buscar no catálogo" }).fill("sunlu petg");
  await expect(sheet.getByRole("option")).toHaveCount(1);
  await sheet.getByRole("option").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Marca")).toHaveValue("Sunlu");
  await expect(page.getByLabel("Peso do rolo (g)")).toHaveValue("1000");

  await page.getByRole("radio", { name: "Verde" }).click();
  await page.getByLabel("Preço por kg").fill("95");
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("row", { name: /Verde/ })).toContainText("R$ 95,00");

  await page.getByRole("row", { name: /Verde/ }).getByRole("button", { name: "Duplicar PETG" }).click();
  await expect(page.getByRole("heading", { name: "Adicionar filamento" })).toBeVisible(); // novo, não edição
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Marca")).toHaveValue("Sunlu");
  await expect(page.getByLabel("Preço por kg")).toHaveValue("95,00");
  await expect(page.getByRole("radio", { name: "Verde" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Estoque", { exact: true })).toHaveValue("1 rolo");
  await page.getByRole("radio", { name: "Preto" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("row", { name: /Preto/ })).toContainText("R$ 95,00");

  const rows = tauri.db.prepare("SELECT material, color, brand, pricePerKg, spoolG, stockG FROM filaments ORDER BY id").all();
  expect(rows).toEqual([
    { material: "PETG", color: "Verde", brand: "Sunlu", pricePerKg: 95, spoolG: 1000, stockG: 1000 },
    { material: "PETG", color: "Preto", brand: "Sunlu", pricePerKg: 95, spoolG: 1000, stockG: 1000 },
  ]);
});

test("calculadora: filamento do fatiador sem cadastro vira cadastro e a linha passa a usá-lo", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 110);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PETG', 'Vermelho', 'Voolt', 100, 1000, 800, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(fixture("bambu-a1-2cores-fatiado.3mf"));
  await expect(page.getByText("Lido de")).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar o filamento 1" }).click();
  const sheet = page.getByRole("dialog", { name: "Cadastrar este filamento" });
  await expect(sheet.getByLabel("Material")).toHaveValue("PLA");
  await expect(sheet.getByRole("radio", { name: "Azul", exact: true })).toHaveAttribute("aria-checked", "true");
  await sheet.getByLabel("Marca").fill("Bambu");
  await sheet.getByLabel("Preço por kg").fill("130");
  await sheet.getByRole("button", { name: "Cadastrar e usar" }).click();
  await expect(sheet).toBeHidden();

  const created = tauri.db.prepare("SELECT id, material, color, brand, pricePerKg, stockG FROM filaments WHERE brand = 'Bambu'").get() as { id: number };
  expect(created).toEqual({ id: expect.any(Number), material: "PLA", color: "Azul", brand: "Bambu", pricePerKg: 130, stockG: 1000 });
  await expect(page.getByLabel("Filamento cadastrado para o filamento 1")).toHaveValue(String(created.id));
  await expect(page.getByRole("button", { name: "Cadastrar o filamento 1" })).toBeHidden();
  const main = page.getByRole("main");
  await expect(main.getByRole("combobox", { name: /^Filamento/ }).nth(0)).toHaveValue(String(created.id));
  await expect(main.getByLabel("Preço por kg").nth(0)).toHaveValue("130,00");
  await expect(main.getByLabel("Gramas").nth(0)).toHaveValue("3,79");
});

/** Preferências de antes da v0.6 (manutenção 5%, sem taxa de falha), para os números do exemplo da home. */
const LEGACY = `INSERT INTO settings (id, data) VALUES (1, '{"maintenancePct":5,"failurePct":0}') ON CONFLICT(id) DO UPDATE SET data = excluded.data`;

/** Exemplo da home: custo R$ 15,96, revenda 47,88, consumidor 79,80; canais padrão (Shopee 20% + 4, ML 14% + 6,75, TikTok 12% + 4) com 30% de margem. */
async function fillHomeExample(page: import("@playwright/test").Page) {
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  const main = page.getByRole("main");
  await main.getByLabel("Preço por kg").fill("85");
  await main.getByLabel("Gramas").fill("120");
  await main.getByRole("button", { name: "Adicionar material" }).click();
  await main.getByLabel("Preço unitário").fill("5");
  await main.getByLabel("Quantidade").fill("1");
  await expect(page.getByRole("row", { name: /Custo por peça/ })).toContainText("R$ 15,96");
  return page.locator(".card", { has: page.getByRole("heading", { name: "Preço por canal" }) });
}

const cells = (card: import("@playwright/test").Locator, channel: RegExp) => card.getByRole("row", { name: channel }).getByRole("cell");

test("calculadora: preço por canal com arredondamento e melhor lucro", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(LEGACY);
  const card = await fillHomeExample(page);
  // Shopee: (15,96 + 4) ÷ (1 − 20% − 30%) = 39,92; taxas 7,98 + 4 = 11,98; lucro 11,98
  await expect(cells(card, /Shopee/)).toHaveText([/^Shopee/, "R$ 39,92", "R$ 11,98", "R$ 11,98", "30%"]);
  await expect(cells(card, /Venda direta/)).toHaveText([/Venda direta/, "R$ 79,80", "R$ 0,00", "R$ 63,84", "80%"]);
  await expect(cells(card, /Mercado Livre/).nth(1)).toHaveText("R$ 40,55");
  await expect(cells(card, /TikTok Shop/).nth(1)).toHaveText("R$ 34,41");
  // melhor lucro: direto (63,84)
  await expect(card.locator(".badge", { hasText: "melhor lucro" })).toHaveCount(1);
  await expect(card.getByRole("row", { name: /Venda direta/ })).toContainText("melhor lucro");
  await expect(card.locator(".badge", { hasText: "abaixo da margem mínima" })).toHaveCount(0);

  const seg = card.getByRole("group", { name: "Arredondar preços" });
  await expect(seg.getByRole("button", { name: "Sem" })).toHaveAttribute("aria-pressed", "true");
  const expected: [string, string, string, string][] = [
    [",90", "R$ 40,90", "R$ 79,90", "R$ 47,90"],
    [",99", "R$ 39,99", "R$ 79,99", "R$ 47,99"],
    ["Inteiro", "R$ 40,00", "R$ 80,00", "R$ 48,00"],
  ];
  for (const [mode, shopee, direct, resale] of expected) {
    await seg.getByRole("button", { name: mode, exact: true }).click();
    await expect(seg.getByRole("button", { name: mode, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(cells(card, /Shopee/).nth(1)).toHaveText(shopee);
    await expect(cells(card, /Venda direta/).nth(1)).toHaveText(direct);
    await expect(cells(card, /Para lojista/).nth(1)).toHaveText(resale);
  }
  // Inteiro na Shopee: 40 → taxas 8 + 4 = 12; lucro 40 − 12 − 15,96 = 12,04
  await expect(cells(card, /Shopee/)).toHaveText([/^Shopee/, "R$ 40,00", "R$ 12,00", "R$ 12,04", "30,1%"]);
});

test("calculadora: preço do concorrente mostra coluna, dica e prejuízo", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(LEGACY);
  const card = await fillHomeExample(page);
  await expect(card.getByRole("columnheader", { name: "Lucro no preço testado" })).toHaveCount(0);
  await expect(card.getByText("Opcional: veja se o seu preço está longe do mercado.")).toBeVisible();
  const competitor = card.getByLabel("Testar um preço (seu ou do concorrente)");

  await competitor.fill("120");
  await expect(card.getByRole("columnheader", { name: "Lucro no preço testado" })).toBeVisible();
  // 79,80 vs 120 → 33,5% abaixo: ok (vende)
  await expect(card.getByText("34% abaixo do concorrente.")).toBeVisible();
  await expect(cells(card, /Venda direta/).nth(5)).toHaveText("R$ 104,04"); // 120 − 15,96

  await competitor.fill("78");
  await expect(card.getByText("Parecido com o concorrente.")).toBeVisible();

  // a R$ 20: Shopee cobra 4 + 4 = 8 → 20 − 8 − 15,96 = −3,96
  await competitor.fill("20");
  await expect(card.getByText("299% acima do concorrente (R$ 20,00).")).toBeVisible();
  const shopeeAtComp = cells(card, /Shopee/).nth(5);
  await expect(shopeeAtComp).toContainText("3,96");
  await expect(shopeeAtComp).toContainText("-");
  await expect(shopeeAtComp.locator(".badge", { hasText: "prejuízo" }).locator("svg")).toBeVisible();
  await expect(cells(card, /Venda direta/).nth(5)).toHaveText("R$ 4,04");
  await expect(cells(card, /Venda direta/).nth(5).locator(".badge")).toHaveCount(0);
  // o preço sugerido do canal continua com lucro
  await expect(cells(card, /Shopee/).nth(3).locator(".badge", { hasText: "prejuízo" })).toHaveCount(0);

  await competitor.fill("");
  await expect(card.getByRole("columnheader", { name: "Lucro no preço testado" })).toHaveCount(0);
});

test("calculadora: canais abaixo da margem mínima das Preferências ganham alerta", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(LEGACY);
  await go(page, "Preferências");
  await page.getByLabel("Margem mínima (%)").fill("50");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(toastWith(page, "Preferências salvas.")).toBeVisible();
  expect(settingsOf(tauri.db).minMarginPct).toBe(50);

  const card = await fillHomeExample(page);
  // marketplaces ficam em ~30% (< 50%); direto 80% e revenda 66,7% não
  for (const ch of [/Shopee/, /Mercado Livre/, /TikTok Shop/]) {
    const badge = card.getByRole("row", { name: ch }).locator(".badge", { hasText: "abaixo da margem mínima" });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("title", "Margem mínima: 50% (Preferências)");
    await expect(badge.locator("svg")).toHaveCount(1);
  }
  for (const ch of [/Venda direta/, /Para lojista/]) await expect(card.getByRole("row", { name: ch })).not.toContainText("abaixo da margem mínima");
  await expect(cells(card, /Para lojista/).nth(4)).toHaveText("66,7%");
});
