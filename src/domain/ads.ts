import { channelPrice, type CalcResult } from "./calc";
import { round2 } from "./format";
import type { ChannelRow } from "./pricing";
import type { Channel, Settings } from "./settings";

/** Como a pessoa informa o anúncio: ROAS esperado ou custo por clique × cliques até uma venda. */
export type AdsInput = { mode: "roas" | "cpc"; roas: number; cpc: number; clicks: number; /** % das vendas que vêm de anúncio. */ sharePct: number };

export type AdsResult = {
  /** Preço ÷ lucro: acima deste ROAS o anúncio se paga. null sem lucro. */
  breakEvenRoas: number | null;
  /** Lucro ÷ preço: o máximo do preço que pode ir para o anúncio. */
  maxAcosPct: number;
  /** Gasto médio de anúncio por venda (já considerando a % de vendas por anúncio). */
  adsPerSale: number;
  profitWithAds: number;
  /** Preço que mantém a margem da linha pagando o anúncio; null = com este ROAS não há preço possível. */
  priceWithAds: number | null;
};

/**
 * Anúncio pago num canal (#29). O preço com anúncio trata a fatia do ROAS como mais uma % sobre o preço e o CPC como
 * custo por venda, e resolve com as mesmas faixas de taxa do canal.
 */
export function adsFor(row: ChannelRow, r: CalcResult, s: Settings, freight: number, a: AdsInput, marketplaceMarginPct = s.marketplaceMarginPct): AdsResult {
  const price = row.price ?? 0;
  const share = Math.min(Math.max(a.sharePct, 0), 100) / 100;
  const roasPct = a.mode === "roas" && a.roas > 0 ? share / a.roas : 0; // fração do preço
  const cpcCost = a.mode === "cpc" ? Math.max(a.cpc, 0) * Math.max(a.clicks, 0) * share : 0;
  const adsPerSale = price * roasPct + cpcCost;
  const market = s.channels.find((c) => c.name === row.name);
  const cfg: Channel = market ?? { name: row.name, feePct: 0, feeFixed: 0 };
  const margin = market ? marketplaceMarginPct : row.marginPct; // marketplace: a margem pedida; direto/lojista: a do multiplicador
  const noAds = a.mode === "roas" ? !(a.roas > 0) : cpcCost === 0;
  const priceWithAds = row.price === null || noAds ? row.price : channelPrice(cfg, r.unitCost + freight + cpcCost, margin + roasPct * 100, s.taxPct);
  return {
    breakEvenRoas: row.profit > 0 && price > 0 ? round2(price / row.profit) : null,
    maxAcosPct: row.profit > 0 && price > 0 ? round2((row.profit / price) * 100) : 0,
    adsPerSale: round2(adsPerSale),
    profitWithAds: round2(row.profit - adsPerSale),
    priceWithAds: priceWithAds === null ? null : round2(priceWithAds),
  };
}

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** "Com ROAS 5, de cada R$ 100 vendidos, R$ 20 vão para o anúncio." */
export const adsSentence = (roas: number) => (roas > 0 ? `Com ROAS ${num(roas)}, de cada R$ 100 vendidos, R$ ${num(Math.round(100 / roas))} vão para o anúncio.` : null);
