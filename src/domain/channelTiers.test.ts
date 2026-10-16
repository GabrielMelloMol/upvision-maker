import { describe, expect, test } from "vitest";
import { calculate, channelFees, channelPrice, type CalcInput } from "./calc";
import { migrateChannels, ML_CLASSIC_2026, ML_PREMIUM_2026, SHOPEE_2026, TIKTOK_2026 } from "./channelDefaults";
import { CHANNEL_PRESETS } from "./channels";
import { DEFAULT_SETTINGS, SettingsSchema } from "./settings";

const margin30 = (c: typeof SHOPEE_2026, cost: number, tax = 0) => channelPrice(c, cost, 30, tax);
/** Margem real vendendo a `price` neste canal. */
const realMargin = (c: typeof SHOPEE_2026, price: number, cost: number) => (price - channelFees(c, price, 0) - cost) / price;

describe("faixas de preço no canal (#242, C1)", () => {
  test("a comissão e a taxa fixa da faixa valem a partir do preço dela: Shopee 2026 nas bordas das faixas", () => {
    expect(channelFees(SHOPEE_2026, 79.99, 0)).toBe(20.5); // 20% + R$ 4,50
    expect(channelFees(SHOPEE_2026, 80, 0)).toBe(27.2); // 14% + R$ 16
    expect(channelFees(SHOPEE_2026, 99.99, 0)).toBe(30); // 14% + R$ 16
    expect(channelFees(SHOPEE_2026, 100, 0)).toBe(34); // 14% + R$ 20
    expect(channelFees(SHOPEE_2026, 199.99, 0)).toBe(48); // 14% + R$ 20
    expect(channelFees(SHOPEE_2026, 200, 0)).toBe(54); // 14% + R$ 26
    expect(channelFees(SHOPEE_2026, 1000, 0)).toBe(166); // sem teto de comissão
  });

  test.each([
    [1, 11.0], [3, 15.0], [8, 25.0], [15, 39.0], [25, 59.0], [40, 107.15], [60, 142.86], [100, 225.0], [250, 492.86],
  ])("Shopee com margem de 30% e custo de R$ %s: preço de R$ %s (tabela da auditoria)", (cost, expected) => {
    const p = margin30(SHOPEE_2026, cost)!;
    expect(p).toBeCloseTo(expected, 1);
    expect(realMargin(SHOPEE_2026, Math.round(p * 100) / 100, cost)).toBeGreaterThanOrEqual(0.2999);
  });

  test("o caso do relatório: custo de R$ 40 sugeria R$ 88,00 (margem real de 22,4%); agora o preço rende os 30%", () => {
    expect(realMargin(SHOPEE_2026, 88, 40)).toBeCloseTo(0.224, 3);
    const p = margin30(SHOPEE_2026, 40)!;
    expect(p).toBeCloseTo(107.15, 1); // o centavo (arredondar para cima) é do B1, na #243
    expect(realMargin(SHOPEE_2026, 107.15, 40)).toBeGreaterThanOrEqual(0.2999);
  });

  test("a faixa de baixo continua certa: custo de R$ 8 dá R$ 25,00 (e não R$ 24,00 da taxa antiga)", () => {
    expect(margin30(SHOPEE_2026, 8)).toBeCloseTo(25, 2);
  });

  test("um canal com faixas sem a faixa certa para o preço volta para a comissão do canal; faixas fora de ordem funcionam", () => {
    const c = { name: "X", feePct: 10, feeFixed: 1, tiers: [{ from: 100, feePct: 5, feeFixed: 0 }, { from: 50, feePct: 8, feeFixed: 2 }] };
    expect(channelFees(c, 20, 0)).toBe(3); // 10% de 20 + 1
    expect(channelFees(c, 60, 0)).toBe(6.8); // 8% de 60 + 2
    expect(channelFees(c, 100, 0)).toBe(5); // 5%
  });

  test("o preço nunca fica numa faixa pior do que a conta usou: o resultado é o menor preço coerente", () => {
    // R$ 80 cai na faixa de 14% + R$ 16, mais barata que 20% + R$ 4,50 acima de ~R$ 98: o menor preço pode estar no limite
    const c = { name: "X", feePct: 20, feeFixed: 4.5, tiers: [{ from: 80, feePct: 14, feeFixed: 16 }] };
    for (const cost of [20, 30, 45, 52, 60]) {
      const p = channelPrice(c, cost, 30, 0)!;
      expect(realMargin(c, Math.round(p * 100) / 100, cost)).toBeGreaterThanOrEqual(0.2999);
      // um centavo a menos não rende a margem pedida
      expect(realMargin(c, Math.round(p * 100) / 100 - 0.02, cost)).toBeLessThan(0.3);
    }
  });
});

describe("canais de fábrica com as regras de 2026 (C1 e C2)", () => {
  const input: CalcInput = { filaments: [], extras: [{ unitPrice: 40, qty: 1 }], printerWatts: 0, printHours: 0, laborHours: 0, quantity: 1, freight: 0, marketplaceMarginPct: 30, failurePct: 0 };

  test("Shopee e Mercado Livre vêm de fábrica com faixas, a data da regra e o aviso de conferir", () => {
    const [shopee, ml] = DEFAULT_SETTINGS.channels;
    expect(shopee.name).toBe("Shopee");
    expect(shopee.tiers).toHaveLength(3);
    expect(shopee.feeFixed).toBe(4.5);
    expect(shopee.checkedAt).toBe("2026-10-15");
    expect(shopee.rulesNote).toMatch(/central do vendedor/);
    expect(ml.name).toBe("Mercado Livre (clássico)");
    expect(ml.freeShippingAbove).toBe(79);
    expect(ml.rulesNote).toMatch(/exemplo/);
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  test("custo de R$ 40: Shopee e ML clássico sugerem R$ 107,15 (antes R$ 88,00 e R$ 83,49), como a auditoria", () => {
    const r = calculate(input, DEFAULT_SETTINGS);
    const by = Object.fromEntries(r.channels.map((c) => [c.name, c]));
    expect(by["Shopee"].price).toBeCloseTo(107.15, 1);
    expect(by["Shopee"].marginPct).toBeGreaterThanOrEqual(29.99);
    expect(by["Mercado Livre (clássico)"].price).toBeCloseTo(107.15, 1);
    expect(by["Mercado Livre (clássico)"].shippingIncluded).toBe(true); // frete obrigatório a partir de R$ 79
    expect(by["Mercado Livre (clássico)"].marginPct).toBeGreaterThanOrEqual(29.99);
  });

  test.each([
    [1, 11.88], [3, 15.45], [8, 26.52], [15, 39.02], [25, 59.2], [60, 142.86], [100, 214.29], [250, 482.15],
  ])("Mercado Livre clássico, custo de R$ %s: R$ %s (frete de R$ 20 de exemplo acima de R$ 79)", (cost, expected) => {
    expect(channelPrice(ML_CLASSIC_2026, cost, 30, 0)).toBeCloseTo(expected, 1);
  });

  test("Mercado Livre premium: mesma estrutura de faixas, comissão maior", () => {
    expect(ML_PREMIUM_2026.feePct).toBeGreaterThan(ML_CLASSIC_2026.feePct);
    expect(ML_PREMIUM_2026.tiers).toHaveLength(3);
    expect(ML_PREMIUM_2026.freeShippingAbove).toBe(79);
    expect(CHANNEL_PRESETS.find((c) => c.name === "Mercado Livre (premium)")).toBe(ML_PREMIUM_2026);
    expect(channelFees(ML_PREMIUM_2026, 50, 0)).toBe(16.65); // 17% de 50 + R$ 8,15
    expect(channelFees(ML_PREMIUM_2026, 100, 0)).toBe(37); // 17% de 100 + frete de R$ 20
  });

  test("com imposto, a conta por faixa continua por dentro: o lucro sobra depois do imposto", () => {
    const r = calculate(input, { ...DEFAULT_SETTINGS, taxPct: 6 });
    const shopee = r.channels.find((c) => c.name === "Shopee")!;
    expect(shopee.marginPct).toBeGreaterThanOrEqual(29.99);
    expect(shopee.price).toBeGreaterThan(107.15);
  });
});

describe("preferências salvas com o canal de fábrica antigo", () => {
  const old = [
    { name: "Shopee", feePct: 20, feeFixed: 4 },
    { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 6.75 },
    { name: "TikTok Shop", feePct: 12, feeFixed: 4 },
  ];

  test("o que a pessoa nunca mexeu passa para as regras de 2026 (Shopee, Mercado Livre e TikTok); canais dela ficam como estão", () => {
    const out = migrateChannels(old);
    expect(out[0]).toBe(SHOPEE_2026);
    expect(out[1]).toBe(ML_CLASSIC_2026);
    expect(out[2]).toBe(TIKTOK_2026);
  });

  test("quem mudou a taxa, conferiu a data ou ajustou faixas não perde o que fez", () => {
    const mine = [
      { name: "Shopee", feePct: 18, feeFixed: 4 }, // taxa própria
      { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 6.75, checkedAt: "2026-08-01" }, // conferiu
    ];
    expect(migrateChannels(mine)).toEqual(mine);
    const tuned = [{ name: "Shopee", feePct: 20, feeFixed: 4, fixedBelow: 79 }];
    expect(migrateChannels(tuned)).toEqual(tuned);
  });
});

describe("TikTok Shop e canais prontos de 2026 (#243, M7)", () => {
  test("TikTok Shop: 10% + R$ 4 abaixo de R$ 50 e 6% + R$ 6 a partir dele (custo R$ 60 sugeria R$ 110,35: agora R$ 103,13)", () => {
    expect(channelFees(TIKTOK_2026, 49.99, 0)).toBe(9); // 10% + 4
    expect(channelFees(TIKTOK_2026, 50, 0)).toBe(9); // 6% + 6
    expect(channelPrice(TIKTOK_2026, 60, 30, 0)).toBeCloseTo(103.13, 1);
    expect(channelPrice(TIKTOK_2026, 1, 30, 0)).toBeCloseTo(8.34, 1);
    expect(channelPrice(TIKTOK_2026, 250, 30, 0)).toBeCloseTo(400, 1);
  });

  test("Shein 18% sem taxa fixa; Amazon 15% + R$ 2 do plano individual, com a nota da categoria; Elo7 não é mais oferecido", () => {
    const by = Object.fromEntries(CHANNEL_PRESETS.map((c) => [c.name, c]));
    expect(by["Shein"]).toMatchObject({ feePct: 18, feeFixed: 0 });
    expect(by["Amazon"]).toMatchObject({ feePct: 15, feeFixed: 2 });
    expect(by["Amazon"].rulesNote).toMatch(/categoria/);
    expect(by["Elo7"]).toBeUndefined();
  });
});
