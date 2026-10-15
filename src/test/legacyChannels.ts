import type { Channel } from "../domain/settings";

/**
 * Os canais de fábrica até a 0.12.5 (Shopee 20% + R$ 4, Mercado Livre 14% + R$ 6,75, TikTok 12% + R$ 4, sem faixas):
 * testes de conta (anúncios, quantidade, planilha) usam estes valores redondos para isolar o que testam; as regras de
 * 2026 têm os testes delas em `channelTiers.test.ts`.
 */
/** Canal "conferido" (data futura: nunca fica velho) não é trocado pela migração das regras de 2026. */
export const KEEP = "2999-01-01";
export const LEGACY_CHANNELS: Channel[] = [
  { name: "Shopee", feePct: 20, feeFixed: 4, checkedAt: KEEP },
  { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 6.75, checkedAt: KEEP },
  { name: "TikTok Shop", feePct: 12, feeFixed: 4 },
];
