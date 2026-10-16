import { describe, expect, test } from "vitest";
import { SHOPEE_2026 } from "./channelDefaults";
import { CHANNEL_PRESETS, newRulesFor, ruleText, staleChannelText, withNewRules } from "./channels";
import { ChannelSchema, type Channel } from "./settings";

test("canais prontos: válidos e com a data da regra de 2026 (exceto a maquininha, que é ponto de partida); o Elo7 encerrou e saiu (M7)", () => {
  expect(CHANNEL_PRESETS.map((c) => c.name)).toEqual(["Mercado Livre (premium)", "Amazon", "Shein", "Instagram/WhatsApp (maquininha)"]);
  for (const c of CHANNEL_PRESETS) {
    expect(ChannelSchema.parse(c)).toEqual(c);
    expect(c.checkedAt).toBe(c.name.startsWith("Instagram") ? undefined : "2026-10-15");
  }
});

test("aviso de taxas velhas: só depois de 90 dias da conferência", () => {
  const c = { name: "Shopee", feePct: 20, feeFixed: 4 };
  expect(staleChannelText({ ...c, checkedAt: "2026-06-01" }, "2026-08-29")).toBeNull(); // 89 dias
  expect(staleChannelText({ ...c, checkedAt: "2026-06-01" }, "2026-10-01")).toBe("Taxas da Shopee conferidas há 4 meses: confira.");
  expect(staleChannelText({ ...c, checkedAt: "2025-09-01" }, "2026-10-01")).toBe("Taxas da Shopee conferidas há 13 meses: confira.");
  expect(staleChannelText(c, "2026-10-01")).toBeNull(); // nunca conferido: sem data, sem aviso
});

describe("regras novas para canal editado (#246)", () => {
  const edited: Channel = { name: "Shopee", feePct: 20, feeFixed: 4, checkedAt: "2026-05-01", extraPerSale: 1.5 };

  test("canal editado antes das regras de 2026 oferece as novas, com antes e depois", () => {
    const fresh = newRulesFor(edited)!;
    expect(fresh.feeFixed).toBe(4.5);
    expect(ruleText(edited).replace(/\u00a0/g, " ")).toBe("20% + R$ 4,00");
    expect(ruleText(fresh).replace(/\u00a0/g, " ")).toContain("a partir de R$ 80,00: 14% + R$ 16,00");
  });

  test("atualizar troca as taxas e mantém o custo extra por venda", () => {
    const next = withNewRules(edited, newRulesFor(edited)!);
    expect(next.feeFixed).toBe(4.5);
    expect(next.extraPerSale).toBe(1.5);
    expect(next.tiers).toHaveLength(3);
  });

  test("sem aviso: já conferido depois das regras, mesma regra, ou canal que não é de fábrica", () => {
    expect(newRulesFor({ ...edited, checkedAt: "2026-10-15" })).toBeNull();
    expect(newRulesFor({ ...SHOPEE_2026, checkedAt: undefined })).toBeNull(); // mesma regra
    expect(newRulesFor({ name: "Minha loja", feePct: 5, feeFixed: 0 })).toBeNull();
  });

  test("sem data de conferência, com taxa diferente, também oferece", () => {
    expect(newRulesFor({ name: "Amazon", feePct: 15, feeFixed: 0 })).not.toBeNull();
  });
});
