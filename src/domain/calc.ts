import { round2 } from "./format";
import type { Channel, Settings } from "./settings";

/** Negativo, NaN ou infinito vira 0. */
const pos = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n > 0 ? n : 0);

export interface CalcInput {
  /** Valores da mesa inteira (todas as peças impressas juntas). */
  filaments: { pricePerKg: number; grams: number }[];
  /** Purga multicor sem arquivo do fatiador (#147): trocas de cor × gramas por troca, ao preço médio dos filamentos. */
  purgeGrams?: number;
  extras: { unitPrice: number; qty: number }[];
  printerWatts: number;
  printHours: number;
  laborHours: number;
  /** Objetos na mesa: o custo da mesa é dividido por este número. */
  quantity: number;
  /** Frete absorvido por unidade: somado depois do multiplicador. */
  freight: number;
  marketplaceMarginPct: number;
  /** Depreciação + desgaste da impressora (R$/h), ver `machineHourCost`. */
  machinePerHour?: number;
  /** Taxa de falha desta mesa (material ou produto, ver `failureFor`); ausente = a geral das Preferências. */
  failurePct?: number;
  /** kWh medido na tomada para esta mesa: substitui W × horas. */
  energyKwh?: number;
  /** Custos operacionais rateados por hora de impressão (0 = desligado). */
  fixedPerHour?: number;
}

/**
 * Taxa de falha de uma mesa (#35): a do produto, se tiver; senão a maior entre os materiais das linhas de filamento
 * que tenham taxa própria; senão a geral. `source` diz de onde veio, para a linha "Falhas 12% (TPU)".
 */
export function failureFor(materials: string[], s: Settings, productPct?: number | null, measured?: { pct: number; prints: number } | null): { pct: number; source?: string } {
  if (productPct != null) return { pct: productPct, source: "produto" };
  // ficha de impressão (#163): o que aconteceu de verdade vale mais que o palpite do material
  if (measured) return { pct: measured.pct, source: `medida em ${measured.prints} impressões` };
  const own = materials.filter((m) => s.failureByMaterial[m] !== undefined).map((m) => ({ pct: s.failureByMaterial[m], source: m }));
  if (!own.length) return { pct: s.failurePct };
  return own.reduce((a, b) => (b.pct > a.pct ? b : a));
}

/** R$ por hora de máquina: preço ÷ vida útil + desgaste. A1 de R$ 3.000 / 5000 h = R$ 0,60/h. */
export function machineHourCost(p: { price: number; lifeHours: number; upkeepPerHour: number }): number {
  return round2((p.lifeHours > 0 ? pos(p.price) / p.lifeHours : 0) + pos(p.upkeepPerHour));
}

export interface ChannelPrice {
  name: string;
  price: number | null; // null = taxa + margem ≥ 100%
  fees: number;
  profit: number;
  marginPct: number;
  /** Neste preço entra o frete obrigatório do canal. */
  shippingIncluded: boolean;
}

const EPS = 1e-9;
const shipsAt = (c: Channel, price: number) => c.freeShippingAbove !== undefined && price >= c.freeShippingAbove - EPS;

/** Comissão (com teto), taxa fixa (só abaixo do limite), frete obrigatório (acima do limite), custo extra por venda e imposto, num preço. */
export const channelFees = (c: Channel, price: number, taxPct: number) => round2(feesAt(c, price, taxPct));

function feesAt(c: Channel, price: number, taxPct: number): number {
  const commission = Math.min((price * pos(c.feePct)) / 100, c.feeCapPerItem ?? Infinity);
  const fixed = c.fixedBelow === undefined || price < c.fixedBelow - EPS ? pos(c.feeFixed) : 0;
  const shipping = shipsAt(c, price) ? pos(c.shippingCost) : 0;
  return commission + fixed + shipping + pos(c.extraPerSale) + (price * pos(taxPct)) / 100;
}

/**
 * Menor preço em que o canal deixa a margem pedida. As taxas mudam por faixa de preço, então resolve a conta em cada
 * faixa (entre os limites do canal) e fica com o menor preço coerente com a própria faixa; um limite também serve
 * quando nele a margem já passa da pedida (a taxa fixa some no limite, por exemplo). null = impossível.
 */
export function channelPrice(c: Channel, cost: number, marginPct: number, taxPct: number): number | null {
  const m = marginPct / 100;
  const t = pos(taxPct) / 100;
  const rate = pos(c.feePct) / 100;
  const cuts = [0, c.fixedBelow, c.freeShippingAbove, c.feeCapPerItem !== undefined && rate > 0 ? c.feeCapPerItem / rate : undefined]
    .filter((x): x is number => x !== undefined)
    .sort((a, b) => a - b);
  const marginAt = (p: number) => (p - feesAt(c, p, taxPct) - cost) / p;
  const candidates: number[] = [];
  cuts.forEach((from, i) => {
    const to = cuts[i + 1] ?? Infinity;
    const probe = to === Infinity ? from + 1 : (from + to) / 2; // estado das taxas dentro da faixa
    const capped = c.feeCapPerItem !== undefined && probe * rate >= c.feeCapPerItem;
    const a = (capped ? 0 : rate) + t;
    const b = pos(c.extraPerSale) + (capped ? c.feeCapPerItem! : 0) + (c.fixedBelow === undefined || probe < c.fixedBelow ? pos(c.feeFixed) : 0) + (shipsAt(c, probe) ? pos(c.shippingCost) : 0);
    const denom = 1 - a - m;
    if (denom > 0) {
      const p = (cost + b) / denom;
      if (p >= from - EPS && p < to) candidates.push(p);
    }
    if (from > 0 && marginAt(from) >= m - EPS) candidates.push(from);
  });
  return candidates.length ? Math.min(...candidates) : null;
}


export function calculate(input: CalcInput, s: Settings) {
  const filament = input.filaments.reduce((t, f) => t + (pos(f.pricePerKg) / 1000) * pos(f.grams), 0);
  const filamentGrams = input.filaments.reduce((t, f) => t + pos(f.grams), 0);
  const purge = filamentGrams > 0 ? (filament / filamentGrams) * pos(input.purgeGrams) : 0;
  const extras = input.extras.reduce((t, e) => t + pos(e.unitPrice) * pos(e.qty), 0);
  const hours = pos(input.printHours);
  const kwh = input.energyKwh !== undefined && input.energyKwh > 0 ? input.energyKwh : (pos(input.printerWatts) / 1000) * hours;
  const energy = kwh * pos(s.kwhPrice);
  const labor = pos(input.laborHours) * pos(s.laborHourCost);
  const machine = pos(input.machinePerHour) * hours;
  // Numa falha perde-se filamento, energia e máquina; a mão de obra e a embalagem não.
  const lost = filament + purge + energy + machine;
  const failure = lost / (1 - Math.min(pos(input.failurePct ?? s.failurePct), 90) / 100) - lost;
  const fixed = pos(input.fixedPerHour) * hours;
  const maintenance = machine > 0 ? 0 : (filament + purge + extras + energy + labor) * (pos(s.maintenancePct) / 100);
  const batchCost = filament + purge + extras + energy + labor + machine + failure + fixed + maintenance;
  const qty = Math.max(1, Math.floor(pos(input.quantity)));
  const unitCost = batchCost / qty;
  const freight = pos(input.freight);
  // Mão de obra e custos fixos somam depois do multiplicador (×5 na hora de trabalho infla o preço).
  const after = ((s.multiplyLabor ? 0 : labor) + fixed) / qty;
  const base = unitCost - after;
  const resale = base * s.multResale + after + freight;
  const consumer = base * s.multConsumer + after + freight;
  const margin = pos(input.marketplaceMarginPct) / 100;
  const tax = pos(s.taxPct) / 100;
  const grams = filamentGrams + (purge > 0 ? pos(input.purgeGrams) : 0);
  const channels: ChannelPrice[] = s.channels.map((c) => {
    const price = channelPrice(c, unitCost + freight, margin * 100, pos(s.taxPct));
    if (price === null) return { name: c.name, price: null, fees: 0, profit: 0, marginPct: 0, shippingIncluded: false };
    const fees = feesAt(c, price, pos(s.taxPct));
    const profit = price - fees - unitCost - freight;
    return { name: c.name, price: round2(price), fees: round2(fees), profit: round2(profit), marginPct: round2((profit / price) * 100), shippingIncluded: shipsAt(c, price) };
  });

  // Arredonda só no fim, para o centavo.
  return {
    filament: round2(filament),
    purge: round2(purge),
    extras: round2(extras),
    energy: round2(energy),
    labor: round2(labor),
    machine: round2(machine),
    failure: round2(failure),
    fixed: round2(fixed),
    maintenance: round2(maintenance),
    batchCost: round2(batchCost),
    unitCost: round2(unitCost),
    resale: round2(resale),
    consumer: round2(consumer),
    resaleProfit: round2(resale * (1 - tax) - unitCost - freight),
    consumerProfit: round2(consumer * (1 - tax) - unitCost - freight),
    perGram: grams > 0 ? round2(batchCost / grams) : null,
    perHour: hours > 0 ? round2(batchCost / hours) : null,
    channels,
  };
}
export type CalcResult = ReturnType<typeof calculate>;
