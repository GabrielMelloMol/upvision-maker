import { expect, test } from "vitest";
import { CHANNEL_PRESETS, staleChannelText } from "./channels";
import { ChannelSchema } from "./settings";

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
