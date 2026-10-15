import { AMAZON_2026, ML_PREMIUM_2026, SHEIN_2026 } from "./channelDefaults";
import type { Channel } from "./settings";

/**
 * Canais prontos para adicionar com um clique (#34). Valores de set/2026 tirados das faixas publicadas por cada
 * plataforma (a comissão varia por categoria e tipo de anúncio): são ponto de partida, a pessoa confere e ajusta.
 */
export const CHANNEL_PRESETS: Channel[] = [
  ML_PREMIUM_2026, // premium 15–19%; custo por unidade por faixa abaixo de R$ 79 e frete a partir dele
  AMAZON_2026, // 10–15% conforme a categoria
  SHEIN_2026, // o Elo7 encerrou as operações em 11/05/2026 e saiu dos canais prontos

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
