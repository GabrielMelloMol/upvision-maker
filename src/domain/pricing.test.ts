import { describe, expect, test } from "vitest";
import { calculate, type CalcInput } from "./calc";
import { compareChannels, competitorHint, markupText, roundPrice } from "./pricing";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const s: Settings = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, laborHourCost: 20, maintenancePct: 5, failurePct: 0, minMarginPct: 10 };
const input: CalcInput = { filaments: [{ pricePerKg: 85, grams: 120 }], extras: [{ unitPrice: 5, qty: 1 }], printerWatts: 0, printHours: 0, laborHours: 0, quantity: 1, freight: 0, marketplaceMarginPct: 30 };
const r = calculate(input, s); // custo 15,96 · consumidor 79,80 · revenda 47,88 · Shopee 39,92

describe("arredondamento (sempre para cima: nunca come a margem)", () => {
  test.each([
    ["none", 39.92, 39.92],
    ["90", 39.92, 40.9],
    ["90", 39.85, 39.9],
    ["90", 39.9, 39.9],
    ["99", 39.92, 39.99],
    ["int", 39.92, 40],
    ["int", 40, 40],
  ] as const)("%s: %d → %d", (mode, p, out) => expect(roundPrice(p, mode)).toBe(out));
});

describe("canais lado a lado", () => {
  test("direto, revenda e marketplaces com lucro líquido depois das taxas; melhor lucro marcado", () => {
    const rows = compareChannels(r, s, input.freight, { rounding: "none" });
    expect(rows.map((x) => x.name)).toEqual(["Venda direta (consumidor final)", "Para lojista (revenda)", "Shopee", "Mercado Livre (clássico)", "TikTok Shop"]);
    expect(rows[0]).toMatchObject({ price: 79.8, fees: 0, profit: 63.84, best: true, loss: false, belowMin: false });
    expect(rows[2]).toMatchObject({ price: 39.92, fees: 11.98, profit: 11.98, best: false });
    expect(rows.filter((x) => x.best)).toHaveLength(1);
  });

  test("arredondar recalcula taxas e lucro no preço arredondado", () => {
    const shopee = compareChannels(r, s, 0, { rounding: "90" })[2];
    expect(shopee.price).toBe(40.9);
    expect(shopee.fees).toBe(12.18); // 40,90 × 20% + 4
    expect(shopee.profit).toBe(12.76);
  });

  test("preço do concorrente: lucro em cada canal nesse preço, com prejuízo marcado", () => {
    const rows = compareChannels(r, s, 0, { rounding: "none", competitor: 20 });
    expect(rows[0].atCompetitor).toMatchObject({ profit: 4.04, loss: false });
    expect(rows[2].atCompetitor).toMatchObject({ fees: 8, profit: -3.96, loss: true }); // Shopee: 20 − (4 + 4) − 15,96
    const none = compareChannels(r, s, 0, { rounding: "none" });
    expect(none[0].atCompetitor).toBeUndefined();
  });

  test("margem mínima: canal abaixo dela é marcado", () => {
    const low = calculate(input, { ...s, multResale: 1.05 });
    const rows = compareChannels(low, { ...s, multResale: 1.05 }, 0, { rounding: "none" });
    expect(rows[1]).toMatchObject({ name: "Para lojista (revenda)", belowMin: true, loss: false });
    expect(rows[0].belowMin).toBe(false);
  });

  test("canal impossível (taxa + margem ≥ 100%) fica sem preço e fora do 'melhor'", () => {
    const rows = compareChannels(calculate({ ...input, marketplaceMarginPct: 90 }, s), s, 0, { rounding: "int" });
    expect(rows[2]).toMatchObject({ price: null, best: false, loss: false });
  });
});

test("aviso do concorrente: parecido até ±5%, abaixo ok, acima pede atenção", () => {
  const hint = (a: number, b: number) => {
    const h = competitorHint(a, b);
    return h && { ...h, text: h.text.replace(/\u00a0/g, " ") };
  };
  expect(hint(79.8, 35)).toEqual({ ok: false, text: "128% acima do concorrente (R$ 35,00)." });
  expect(hint(79.8, 120)).toEqual({ ok: true, text: "34% abaixo do concorrente." });
  expect(hint(79.8, 95)).toEqual({ ok: true, text: "16% abaixo do concorrente." });
  expect(hint(79.8, 78)).toEqual({ ok: true, text: "Parecido com o concorrente." });
  expect(hint(79.8, 0)).toBeNull();
});

describe("impostos", () => {
  test("imposto entra nas taxas de todos os canais, inclusive o direto", () => {
    const st = { ...s, taxPct: 6 };
    const rows = compareChannels(calculate(input, st), st, 0, { rounding: "none" });
    expect(rows[0]).toMatchObject({ price: 79.8, fees: 4.79, profit: 59.05 }); // 79,80 × 6%
    expect(rows[2].marginPct).toBe(30); // Shopee continua com a margem pedida
  });
});

test("markup × margem explicados com os números do multiplicador", () => {
  expect(markupText(5)).toBe("markup 400 % · margem 80 % antes das taxas");
  expect(markupText(3)).toBe("markup 200 % · margem 66,7 % antes das taxas");
});
