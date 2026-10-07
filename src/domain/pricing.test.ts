import { describe, expect, test } from "vitest";
import { calculate, type CalcInput } from "./calc";
import { compareChannels, competitorHint, hourStatus, markupText, prepCost, quantityTable, roundPrice } from "./pricing";
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

test("UX M1: markup e margem em palavras do dia a dia, com os números do multiplicador", () => {
  expect(markupText(5)).toBe("lucro de 400 % sobre o custo (80 % do preço), antes das taxas");
  expect(markupText(3)).toBe("lucro de 200 % sobre o custo (66,7 % do preço), antes das taxas");
});

describe("lucro por hora de máquina e meta de R$/h (#30)", () => {
  test("lucro por hora = lucro × peças ÷ horas da mesa, também no preço testado; sem tempo não há", () => {
    const rows = compareChannels(r, s, 0, { rounding: "none", hours: 2, qty: 1, competitor: 20 });
    expect(rows[0].profitPerHour).toBe(31.92); // 63,84 ÷ 2 h
    expect(rows[2].profitPerHour).toBe(5.99); // Shopee 11,98 ÷ 2
    expect(rows[0].atCompetitor?.profitPerHour).toBe(2.02); // 4,04 ÷ 2
    const four = compareChannels(r, s, 0, { rounding: "none", hours: 2, qty: 4 });
    expect(four[0].profitPerHour).toBe(127.68); // 4 peças na mesa
    expect(compareChannels(r, s, 0, { rounding: "none" })[0].profitPerHour).toBeNull();
  });

  test("preço pela meta: (custo + meta × horas ÷ peças + taxa fixa + frete) ÷ (1 − taxa − imposto)", () => {
    const st = { ...s, targetProfitPerHour: 10 };
    const rows = compareChannels(r, st, 0, { rounding: "none", hours: 2, qty: 1 });
    expect(rows[0].targetPrice).toBe(35.96); // 15,96 + 20
    expect(rows[2].targetPrice).toBe(49.95); // (15,96 + 20 + 4) ÷ 0,8
    expect(compareChannels(r, s, 0, { rounding: "none", hours: 2, qty: 1 })[0].targetPrice).toBeNull(); // meta desligada
  });

  test("semáforo da meta: < 50% vermelho, < meta amarelo, na meta verde; sem meta nada", () => {
    expect(hourStatus(4, 10)).toBe("low");
    expect(hourStatus(5, 10)).toBe("below");
    expect(hourStatus(10, 10)).toBe("ok");
    expect(hourStatus(10, 0)).toBeNull();
    expect(hourStatus(null, 10)).toBeNull();
  });
});

test("faixas de preço (#31): arredondar para dentro da faixa do frete recalcula as taxas e sinaliza", () => {
  const st = { ...s, maintenancePct: 0, channels: [{ name: "ML", feePct: 10, feeFixed: 0, freeShippingAbove: 40, shippingCost: 15 }] };
  const res = calculate({ ...input, extras: [], filaments: [{ pricePerKg: 100, grams: 234 }] }, st); // custo 23,40 → 23,40 ÷ 0,6 = 39
  const plain = compareChannels(res, st, 0, { rounding: "none" })[2];
  expect(plain).toMatchObject({ price: 39, fees: 3.9, shippingIncluded: false });
  const up = compareChannels(res, st, 0, { rounding: "int", competitor: 45 })[2];
  expect(up).toMatchObject({ price: 39, shippingIncluded: false });
  expect(up.atCompetitor).toMatchObject({ fees: 19.5, profit: 2.1 }); // 45: 4,50 + frete 15
  const ninety = compareChannels(res, st, 0, { rounding: "90" })[2];
  expect(ninety).toMatchObject({ price: 39.9, shippingIncluded: false });
  // custo 23,60 → 39,33; inteiro sobe para 40 e cai na faixa do frete: 4 + 15 de taxas, prejuízo e aviso
  const round40 = compareChannels(calculate({ ...input, extras: [], filaments: [{ pricePerKg: 100, grams: 236 }] }, st), st, 0, { rounding: "int" })[2];
  expect(round40).toMatchObject({ price: 40, fees: 19, profit: -2.6, loss: true, shippingIncluded: true });
});

describe("preço por quantidade com preparo por pedido (#32)", () => {
  // exemplo da home: custo 15,96, venda direta 79,80 (×5), Shopee 20% + R$ 4 com margem 30%
  test("preparo = minutos × sua hora + fixo", () => {
    expect(prepCost(30, 5, s)).toBe(15); // 0,5 h × R$ 20 + 5
    expect(prepCost(0, 0, s)).toBe(0);
  });

  test("venda direta: preparo dividido pela quantidade, somado depois do multiplicador; desconto em relação a 1 unidade", () => {
    const rows = quantityTable(r, s, { channel: "Venda direta (consumidor final)", prep: 15, freight: 0, rounding: "none" });
    expect(rows.map((x) => x.qty)).toEqual([1, 10, 25, 50, 100]);
    expect(rows[0]).toMatchObject({ unitCost: 30.96, price: 94.8, discountPct: 0 });
    expect(rows[1]).toMatchObject({ unitCost: 17.46, price: 81.3, discountPct: 14.24 });
    expect(rows[4]).toMatchObject({ unitCost: 16.11, price: 79.95 });
  });

  test("marketplace: preço do canal com o custo de cada quantidade; alerta de margem mínima", () => {
    const rows = quantityTable(r, s, { channel: "Shopee", prep: 15, freight: 0, rounding: "none" });
    expect(rows[0]).toMatchObject({ price: 69.92, marginPct: 30.01, belowMin: false }); // (30,96 + 4) ÷ 0,5; taxas no centavo
    expect(rows[1]).toMatchObject({ price: 42.92, discountPct: 38.62 });
    const strict = quantityTable(r, { ...s, minMarginPct: 40 }, { channel: "Shopee", prep: 15, freight: 0, rounding: "none" });
    expect(strict[0].belowMin).toBe(true);
  });
});
