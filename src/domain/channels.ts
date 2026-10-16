import { AMAZON_2026, ML_CLASSIC_2026, ML_PREMIUM_2026, RULES_DATE, SHEIN_2026, SHOPEE_2026, TIKTOK_2026 } from "./channelDefaults";
import { money } from "./format";
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

/** Os canais de fábrica com as regras de 2026, para comparar com o canal que a pessoa editou (#246). */
const FACTORY: Channel[] = [SHOPEE_2026, ML_CLASSIC_2026, ML_PREMIUM_2026, TIKTOK_2026, AMAZON_2026, SHEIN_2026];

/** O que define a taxa de um canal: se isto é igual, as regras são as mesmas. */
const ruleKey = (c: Channel) => JSON.stringify([c.feePct, c.feeFixed, c.feeMinPerItem ?? 0, c.fixedBelow ?? 0, c.feeCapPerItem ?? 0, c.freeShippingAbove ?? 0, c.shippingCost ?? 0, [...(c.tiers ?? [])].sort((a, b) => a.from - b.from).map((t) => [t.from, t.feePct, t.feeFixed])]);

/**
 * Canal que a pessoa editou e que tem regras novas de fábrica (#246): a de fábrica com o mesmo nome, data de regras
 * posterior à última conferência dele (ou sem conferência) e taxas diferentes. null = nada a oferecer.
 */
export function newRulesFor(c: Channel): Channel | null {
  const fresh = FACTORY.find((f) => f.name === c.name);
  if (!fresh || (c.checkedAt && c.checkedAt >= RULES_DATE)) return null;
  return ruleKey(c) === ruleKey(fresh) ? null : fresh;
}

/** A regra em uma frase, para o antes e o depois: "20% + R$ 4,00; faixas: a partir de R$ 80,00 14% + R$ 16,00". */
export function ruleText(c: Channel): string {
  const tiers = [...(c.tiers ?? [])].sort((a, b) => a.from - b.from).map((t) => `a partir de ${money(t.from)}: ${String(t.feePct).replace(".", ",")}% + ${money(t.feeFixed)}`);
  const extra = [c.feeMinPerItem ? `comissão mínima ${money(c.feeMinPerItem)}` : "", c.feeCapPerItem ? `teto da comissão ${money(c.feeCapPerItem)}` : "", c.fixedBelow ? `taxa fixa só abaixo de ${money(c.fixedBelow)}` : "", c.freeShippingAbove ? `frete por sua conta a partir de ${money(c.freeShippingAbove)} (${money(c.shippingCost ?? 0)})` : ""].filter(Boolean);
  return [`${String(c.feePct).replace(".", ",")}% + ${money(c.feeFixed)}`, ...tiers, ...extra].join("; ");
}

/** O canal da pessoa com as regras de 2026: troca as taxas e a nota, mantém o que é só dela (custo extra por venda). */
export function withNewRules(c: Channel, fresh: Channel): Channel {
  return { ...fresh, ...(c.extraPerSale !== undefined ? { extraPerSale: c.extraPerSale } : {}) };
}
