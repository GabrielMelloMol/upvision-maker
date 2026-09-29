import { expect, test } from "vitest";
import { CHANNEL_PRESETS, staleChannelText } from "./channels";
import { ChannelSchema } from "./settings";

test("canais prontos: válidos, sem data de conferência (são ponto de partida)", () => {
  expect(CHANNEL_PRESETS.map((c) => c.name)).toEqual(
    expect.arrayContaining(["Mercado Livre (premium)", "Amazon", "Elo7", "Shein", "Instagram/WhatsApp (maquininha)"]),
  );
  for (const c of CHANNEL_PRESETS) {
    expect(ChannelSchema.parse(c)).toEqual(c);
    expect(c.checkedAt).toBeUndefined();
  }
});

test("aviso de taxas velhas: só depois de 90 dias da conferência", () => {
  const c = { name: "Shopee", feePct: 20, feeFixed: 4 };
  expect(staleChannelText({ ...c, checkedAt: "2026-06-01" }, "2026-08-29")).toBeNull(); // 89 dias
  expect(staleChannelText({ ...c, checkedAt: "2026-06-01" }, "2026-10-01")).toBe("Taxas da Shopee conferidas há 4 meses: confira.");
  expect(staleChannelText({ ...c, checkedAt: "2025-09-01" }, "2026-10-01")).toBe("Taxas da Shopee conferidas há 13 meses: confira.");
  expect(staleChannelText(c, "2026-10-01")).toBeNull(); // nunca conferido: sem data, sem aviso
});
