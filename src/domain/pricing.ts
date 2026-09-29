import type { CalcResult } from "./calc";
import { money, round2 } from "./format";
import type { Settings } from "./settings";

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
};

/** Taxas, lucro líquido e margem de um preço num canal. */
function at(price: number, feePct: number, feeFixed: number, unitCost: number, freight: number, hoursPerUnit: number): Money {
  const fees = round2((price * feePct) / 100 + feeFixed);
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
  const bases = [
    { name: PRICE_NAMES.consumer.name, suggested: r.consumer as number | null, feePct: 0, feeFixed: 0 },
    { name: PRICE_NAMES.resale.name, suggested: r.resale as number | null, feePct: 0, feeFixed: 0 },
    ...r.channels.map((c) => {
      const cfg = s.channels.find((x) => x.name === c.name);
      return { name: c.name, suggested: c.price, feePct: cfg?.feePct ?? 0, feeFixed: cfg?.feeFixed ?? 0 };
    }),
  ];
  const comp = opts.competitor && opts.competitor > 0 ? opts.competitor : undefined;
  const rows: ChannelRow[] = bases.map((b) => {
    const feePct = b.feePct + s.taxPct; // imposto sobre a venda conta como taxa em todo canal
    const atComp = comp !== undefined ? at(comp, feePct, b.feeFixed, r.unitCost, freight, hoursPerUnit) : undefined;
    const denom = 1 - feePct / 100;
    const targetPrice = target > 0 && denom > 0 ? roundPrice((r.unitCost + target + b.feeFixed + freight) / denom, opts.rounding) : null;
    if (b.suggested === null)
      return { name: b.name, price: null, fees: 0, profit: 0, marginPct: 0, loss: false, profitPerHour: null, belowMin: false, best: false, atCompetitor: atComp, targetPrice };
    const m = at(roundPrice(b.suggested, opts.rounding), feePct, b.feeFixed, r.unitCost, freight, hoursPerUnit);
    return { name: b.name, ...m, belowMin: !m.loss && m.marginPct < s.minMarginPct, best: false, atCompetitor: atComp, targetPrice };
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
