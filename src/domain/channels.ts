import type { Channel } from "./settings";

/**
 * Canais prontos para adicionar com um clique (#34). Valores de set/2026 tirados das faixas publicadas por cada
 * plataforma (a comissão varia por categoria e tipo de anúncio): são ponto de partida, a pessoa confere e ajusta.
 */
export const CHANNEL_PRESETS: Channel[] = [
  { name: "Mercado Livre (premium)", feePct: 17, feeFixed: 6.75, fixedBelow: 79 }, // premium 15–19%; custo fixo só abaixo de R$ 79
  { name: "Amazon", feePct: 15, feeFixed: 0 }, // 8–15% conforme a categoria
  { name: "Elo7", feePct: 18, feeFixed: 0 },
  { name: "Shein", feePct: 16, feeFixed: 0 },
  { name: "Instagram/WhatsApp (maquininha)", feePct: 4, feeFixed: 0 }, // taxa do cartão de crédito à vista
];

const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

/** "Taxas da Shopee conferidas há 4 meses: confira." depois de 90 dias; sem data de conferência, nada. */
export function staleChannelText(c: Channel, today: string): string | null {
  if (!c.checkedAt) return null;
  const days = Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(`${c.checkedAt}T12:00:00`)) / DAY_MS);
  if (!(days > STALE_DAYS)) return null;
  return `Taxas da ${c.name} conferidas há ${Math.floor(days / 30)} meses: confira.`;
}
