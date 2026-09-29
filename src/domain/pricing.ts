import { channelFees, channelPrice, type CalcResult } from "./calc";
import { money, round2 } from "./format";
import type { Channel, Settings } from "./settings";

export type Rounding = "none" | "90" | "99" | "int";
export const ROUNDINGS: readonly (readonly [Rounding, string])[] = [
  ["none", "Sem"],
  ["90", ",90"],
  ["99", ",99"],
  ["int", "Inteiro"],
];

const EPS = 1e-9;

/** Arredonda sempre PARA CIMA até o final escolhido (R$ 39,92 → 40,90 / 39,99 / 40): nunca reduz a margem. */
export function roundPrice(p: number, mode: Rounding): number {
  if (mode === "none") return round2(p);
  if (mode === "int") return Math.ceil(p - EPS);
  const end = mode === "90" ? 0.9 : 0.99;
  const k = Math.floor(p);
  return round2(k + end >= p - EPS ? k + end : k + 1 + end);
}

/** Os dois preços do multiplicador, com nomes e explicação que a usuária entende (feedback real, #22). */
export const PRICE_NAMES = {
  consumer: { name: "Venda direta (consumidor final)", help: "Para quem compra de você para usar ou presentear: WhatsApp, feira, encomenda." },
  resale: { name: "Para lojista (revenda)", help: "Para quem compra de você para revender: loja, papelaria. Precisa sobrar lucro para ele." },
} as const;

/** profitPerHour: lucro por hora de máquina (lucro × peças ÷ horas da mesa); null sem tempo de impressão. */
type Money = { price: number; fees: number; profit: number; marginPct: number; loss: boolean; profitPerHour: number | null };

export type ChannelRow = {
  name: string;
  /** null = taxa + margem passam de 100% (não há preço possível). */
  price: number | null;
  fees: number;
  profit: number;
  marginPct: number;
  loss: boolean;
  profitPerHour: number | null;
  belowMin: boolean;
  best: boolean;
  /** Lucro vendendo pelo preço do concorrente neste canal. */
  atCompetitor?: Money;
  /** Preço que rende a meta de R$/h (Preferências); null com meta desligada ou sem tempo. */
  targetPrice: number | null;
  /** Neste preço entra o frete obrigatório do canal (faixas de preço, #31). */
  shippingIncluded: boolean;
};

/** Taxas, lucro líquido e margem de um preço num canal. */
function at(price: number, c: Channel, taxPct: number, unitCost: number, freight: number, hoursPerUnit: number): Money {
  const fees = channelFees(c, price, taxPct);
  const profit = round2(price - fees - unitCost - freight);
  const profitPerHour = hoursPerUnit > 0 ? round2(profit / hoursPerUnit) : null;
  return { price, fees, profit, marginPct: price > 0 ? round2((profit / price) * 100) : 0, loss: profit < 0, profitPerHour };
}

/** Semáforo da meta de R$/h: abaixo da metade é vermelho, abaixo da meta amarelo. null sem meta ou sem tempo. */
export function hourStatus(profitPerHour: number | null, target: number): "low" | "below" | "ok" | null {
  if (!(target > 0) || profitPerHour === null) return null;
  return profitPerHour < target / 2 ? "low" : profitPerHour < target ? "below" : "ok";
}

/**
 * Preço sugerido em cada canal lado a lado — direto (sem taxa), revenda e cada marketplace — com lucro líquido depois das
 * taxas, alertas de prejuízo e de margem mínima, o canal de melhor lucro e, opcionalmente, o lucro no preço do concorrente.
 */
export function compareChannels(r: CalcResult, s: Settings, freight: number, opts: { rounding: Rounding; competitor?: number; hours?: number; qty?: number }): ChannelRow[] {
  const hoursPerUnit = opts.hours && opts.hours > 0 ? opts.hours / Math.max(1, Math.floor(opts.qty ?? 1) || 1) : 0;
  const target = s.targetProfitPerHour > 0 && hoursPerUnit > 0 ? s.targetProfitPerHour * hoursPerUnit : 0; // lucro por peça pedido pela meta
  const direct = (name: string): Channel => ({ name, feePct: 0, feeFixed: 0 });
  const bases = [
    { name: PRICE_NAMES.consumer.name, suggested: r.consumer as number | null, cfg: direct(PRICE_NAMES.consumer.name) },
    { name: PRICE_NAMES.resale.name, suggested: r.resale as number | null, cfg: direct(PRICE_NAMES.resale.name) },
    ...r.channels.map((c) => ({ name: c.name, suggested: c.price, cfg: s.channels.find((x) => x.name === c.name) ?? direct(c.name) })),
  ];
  const comp = opts.competitor && opts.competitor > 0 ? opts.competitor : undefined;
  const ships = (c: Channel, p: number) => c.freeShippingAbove !== undefined && p >= c.freeShippingAbove;
  const rows: ChannelRow[] = bases.map((b) => {
    // imposto sobre a venda conta como taxa em todo canal
    const atComp = comp !== undefined ? at(comp, b.cfg, s.taxPct, r.unitCost, freight, hoursPerUnit) : undefined;
    const tp = target > 0 ? channelPrice(b.cfg, r.unitCost + target + freight, 0, s.taxPct) : null;
    const targetPrice = tp === null ? null : roundPrice(tp, opts.rounding);
    if (b.suggested === null)
      return { name: b.name, price: null, fees: 0, profit: 0, marginPct: 0, loss: false, profitPerHour: null, belowMin: false, best: false, atCompetitor: atComp, targetPrice, shippingIncluded: false };
    const price = roundPrice(b.suggested, opts.rounding);
    const m = at(price, b.cfg, s.taxPct, r.unitCost, freight, hoursPerUnit);
    return { name: b.name, ...m, belowMin: !m.loss && m.marginPct < s.minMarginPct, best: false, atCompetitor: atComp, targetPrice, shippingIncluded: ships(b.cfg, price) };
  });
  const priced = rows.filter((x) => x.price !== null);
  const top = priced.reduce<ChannelRow | null>((a, b) => (!a || b.profit > a.profit ? b : a), null);
  return rows.map((x) => ({ ...x, best: x === top }));
}

const SIMILAR_PCT = 5;

/** Compara o preço direto com o do concorrente: até ±5% é "parecido"; abaixo é ok (vende), acima pede atenção. null sem concorrente. */
export function competitorHint(ours: number, competitor: number): { ok: boolean; text: string } | null {
  if (!(competitor > 0) || !(ours > 0)) return null;
  const rel = (ours - competitor) / competitor;
  const pct = Math.round(Math.abs(rel) * 100); // arredonda igual para cima e para baixo
  if (pct <= SIMILAR_PCT) return { ok: true, text: "Parecido com o concorrente." };
  return rel < 0 ? { ok: true, text: `${pct}% abaixo do concorrente.` } : { ok: false, text: `${pct}% acima do concorrente (${money(competitor)}).` };
}

const pctText = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} %`;

/** "×5" explicado: markup = mult − 1, margem = 1 − 1/mult (a "margem 500%" de outras calculadoras é markup). */
export const markupText = (mult: number) => `markup ${pctText((mult - 1) * 100)} · margem ${pctText((1 - 1 / mult) * 100)} antes das taxas`;

/** Preparo por pedido (atendimento, fatiar, trocar filamento): minutos × sua hora + um valor fixo. */
export const prepCost = (minutes: number, fixed: number, s: Settings) => round2((Math.max(0, minutes) / 60) * s.laborHourCost + Math.max(0, fixed));

export const QUANTITIES = [1, 10, 25, 50, 100] as const;

export type QtyRow = { qty: number; unitCost: number; price: number | null; discountPct: number; marginPct: number; belowMin: boolean; loss: boolean };

/**
 * Preço por unidade em pedidos de 1, 10, 25, 50 e 100 unidades (#32): o preparo do pedido é dividido pela quantidade.
 * Venda direta e lojista usam o multiplicador (o preparo é mão de obra: entra depois dele, salvo no jeito antigo);
 * marketplaces usam o preço do canal com a margem pedida. Desconto = quanto a unidade sai mais barata que no pedido de 1.
 */
export function quantityTable(r: CalcResult, s: Settings, o: { channel: string; prep: number; freight: number; rounding: Rounding; marginPct?: number }): QtyRow[] {
  const cfg = s.channels.find((c) => c.name === o.channel);
  const mult = o.channel === PRICE_NAMES.resale.name ? s.multResale : s.multConsumer;
  const suggested = o.channel === PRICE_NAMES.resale.name ? r.resale : r.consumer;
  const priceAt = (extra: number): number | null => {
    if (!cfg) return suggested + extra * (s.multiplyLabor ? mult : 1);
    return channelPrice(cfg, r.unitCost + extra + o.freight, o.marginPct ?? s.marketplaceMarginPct, s.taxPct);
  };
  const fees = cfg ?? { name: o.channel, feePct: 0, feeFixed: 0 };
  const rows = QUANTITIES.map((qty) => {
    const extra = o.prep / qty;
    const raw = priceAt(extra);
    const price = raw === null ? null : roundPrice(raw, o.rounding);
    const unitCost = round2(r.unitCost + extra);
    const m = price === null ? null : at(price, fees, s.taxPct, unitCost, o.freight, 0);
    return { qty, unitCost, price, marginPct: m?.marginPct ?? 0, belowMin: !!m && !m.loss && m.marginPct < s.minMarginPct, loss: !!m?.loss };
  });
  const first = rows[0].price;
  return rows.map((x) => ({ ...x, discountPct: first && x.price !== null ? round2((1 - x.price / first) * 100) : 0 }));
}
