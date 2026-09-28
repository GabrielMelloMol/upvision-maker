import { describe, expect, test } from "vitest";
import { calculate, type CalcInput } from "./calc";
import { compareChannels, competitorHint, roundPrice } from "./pricing";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const s: Settings = { ...DEFAULT_SETTINGS, kwhPrice: 0.9, laborHourCost: 20, maintenancePct: 5, minMarginPct: 10 };
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
    expect(rows.map((x) => x.name)).toEqual(["Direto ao consumidor", "Revenda", "Shopee", "Mercado Livre (clássico)", "TikTok Shop"]);
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
    expect(rows[1]).toMatchObject({ name: "Revenda", belowMin: true, loss: false });
    expect(rows[0].belowMin).toBe(false);
  });

  test("canal impossível (taxa + margem ≥ 100%) fica sem preço e fora do 'melhor'", () => {
    const rows = compareChannels(calculate({ ...input, marketplaceMarginPct: 90 }, s), s, 0, { rounding: "int" });
    expect(rows[2]).toMatchObject({ price: null, best: false, loss: false });
  });
});

test("aviso do concorrente: muito acima, muito abaixo ou parecido", () => {
  const hint = (a: number, b: number) => {
    const h = competitorHint(a, b);
    return h && { ...h, text: h.text.replace(/\u00a0/g, " ") };
  };
  expect(hint(79.8, 35)).toEqual({ ok: false, text: "Seu preço direto está 128% acima do concorrente (R$ 35,00)." });
  expect(hint(79.8, 120)).toEqual({ ok: false, text: "Seu preço direto está 34% abaixo do concorrente (R$ 120,00): dá para cobrar mais." });
  expect(hint(79.8, 78)).toEqual({ ok: true, text: "Parecido com o concorrente (2% acima)." });
  expect(competitorHint(79.8, 0)).toBeNull();
});
