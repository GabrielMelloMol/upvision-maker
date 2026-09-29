import { describe, expect, test } from "vitest";
import { adsFor, adsSentence } from "./ads";
import { calculate, type CalcInput } from "./calc";
import { compareChannels } from "./pricing";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

// exemplo da home: custo 15,96; Shopee 20% + R$ 4 com margem 30% → R$ 39,92, lucro 11,98
const s: Settings = { ...DEFAULT_SETTINGS, laborHourCost: 20, maintenancePct: 5, failurePct: 0 };
const input: CalcInput = { filaments: [{ pricePerKg: 85, grams: 120 }], extras: [{ unitPrice: 5, qty: 1 }], printerWatts: 0, printHours: 0, laborHours: 0, quantity: 1, freight: 0, marketplaceMarginPct: 30 };
const r = calculate(input, s);
const shopee = compareChannels(r, s, 0, { rounding: "none" })[2];

describe("anúncios (#29)", () => {
  test("ROAS de equilíbrio = preço ÷ lucro; ACOS máximo = lucro ÷ preço", () => {
    const a = adsFor(shopee, r, s, 0, { mode: "roas", roas: 5, cpc: 0, clicks: 0, sharePct: 100 });
    expect(a.breakEvenRoas).toBe(3.33);
    expect(a.maxAcosPct).toBe(30.01);
  });

  test("ROAS 5: anúncio por venda = preço ÷ 5; lucro com anúncio; preço que mantém a margem de 30%", () => {
    const a = adsFor(shopee, r, s, 0, { mode: "roas", roas: 5, cpc: 0, clicks: 0, sharePct: 100 });
    expect(a).toMatchObject({ adsPerSale: 7.98, profitWithAds: 4, priceWithAds: 66.53 }); // (15,96 + 4) ÷ (1 − 0,2 − 0,3 − 0,2)
  });

  test("CPC × cliques por venda, com metade das vendas vindas de anúncio", () => {
    const a = adsFor(shopee, r, s, 0, { mode: "cpc", roas: 0, cpc: 0.35, clicks: 15, sharePct: 50 });
    expect(a).toMatchObject({ adsPerSale: 2.63, profitWithAds: 9.36 }); // 5,25 × 50%
    expect(a.priceWithAds).toBe(45.17); // (15,96 + 2,625 + 4) ÷ 0,5
  });

  test("ROAS baixo demais: não há preço possível; sem lucro não há ROAS de equilíbrio", () => {
    expect(adsFor(shopee, r, s, 0, { mode: "roas", roas: 2, cpc: 0, clicks: 0, sharePct: 100 }).priceWithAds).toBeNull(); // 20% + 30% + 50%
    const noProfit = { ...shopee, profit: 0 };
    expect(adsFor(noProfit, r, s, 0, { mode: "roas", roas: 5, cpc: 0, clicks: 0, sharePct: 100 })).toMatchObject({ breakEvenRoas: null, maxAcosPct: 0 });
  });

  test("frase de uma linha", () => {
    expect(adsSentence(5)).toBe("Com ROAS 5, de cada R$ 100 vendidos, R$ 20 vão para o anúncio.");
    expect(adsSentence(3.33)).toBe("Com ROAS 3,33, de cada R$ 100 vendidos, R$ 30 vão para o anúncio.");
    expect(adsSentence(0)).toBeNull();
  });
});
