import { describe, expect, test } from "vitest";
import { channelFees, channelPrice, withCategory } from "./calc";
import { AMAZON_2026, ML_CLASSIC_2026 } from "./channelDefaults";
import type { Channel } from "./settings";

const ml = (category?: string): Channel => ({ ...ML_CLASSIC_2026, categories: [{ name: "Brinquedos", feePct: 12 }, { name: "Outras", feePct: 14 }], category });

describe("comissão por categoria do anúncio (#246)", () => {
  test("a categoria escolhida troca a comissão do canal e a de cada faixa", () => {
    const c = withCategory(ml("Brinquedos"));
    expect(c.feePct).toBe(12);
    expect(c.tiers!.every((t) => t.feePct === 12)).toBe(true);
    expect(c.tiers![0].feeFixed).toBe(ML_CLASSIC_2026.tiers![0].feeFixed); // a taxa fixa da faixa fica
  });

  test("sem categoria ou com nome que não existe, o canal fica como está", () => {
    expect(withCategory(ml())).toEqual(ml());
    expect(withCategory(ml("Sumiu"))).toEqual(ml("Sumiu"));
  });

  test("categoria de comissão menor dá taxa menor e preço menor para a mesma margem", () => {
    const a = channelFees(ml("Brinquedos"), 100, 0);
    const b = channelFees(ml("Outras"), 100, 0);
    expect(b - a).toBeCloseTo(2, 2); // 14% − 12% de R$ 100
    expect(channelPrice(ml("Brinquedos"), 30, 30, 0)!).toBeLessThan(channelPrice(ml("Outras"), 30, 30, 0)!);
  });

  test("o preço calculado deixa a margem pedida na categoria escolhida", () => {
    const c = ml("Brinquedos");
    const p = channelPrice(c, 25, 30, 4)!;
    expect((p - channelFees(c, p, 4) - 25) / p).toBeCloseTo(0.3, 3);
  });

  test("comissão mínima por item (Amazon: R$ 1) vale em preço baixo e some em preço alto", () => {
    const am: Channel = { ...AMAZON_2026, feePct: 10, feeFixed: 0, feeMinPerItem: 1, category: undefined };
    expect(channelFees(am, 5, 0)).toBe(1); // 10% de R$ 5 = 0,50 → mínimo R$ 1
    expect(channelFees(am, 50, 0)).toBe(5); // 10% de R$ 50
    const p = channelPrice(am, 3, 30, 0)!; // preço baixo: o mínimo de R$ 1 entra como valor fixo
    expect((p - channelFees(am, p, 0) - 3) / p).toBeCloseTo(0.3, 3);
    expect(p).toBeCloseTo(4 / 0.7, 1);
  });
});
