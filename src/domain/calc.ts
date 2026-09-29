import { round2 } from "./format";
import type { Settings } from "./settings";

/** Negativo, NaN ou infinito vira 0. */
const pos = (n: number | undefined) => (n !== undefined && Number.isFinite(n) && n > 0 ? n : 0);

export interface CalcInput {
  /** Valores da mesa inteira (todas as peças impressas juntas). */
  filaments: { pricePerKg: number; grams: number }[];
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
  /** kWh medido na tomada para esta mesa: substitui W × horas. */
  energyKwh?: number;
  /** Custos operacionais rateados por hora de impressão (0 = desligado). */
  fixedPerHour?: number;
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
}


export function calculate(input: CalcInput, s: Settings) {
  const filament = input.filaments.reduce((t, f) => t + (pos(f.pricePerKg) / 1000) * pos(f.grams), 0);
  const extras = input.extras.reduce((t, e) => t + pos(e.unitPrice) * pos(e.qty), 0);
  const hours = pos(input.printHours);
  const kwh = input.energyKwh !== undefined && input.energyKwh > 0 ? input.energyKwh : (pos(input.printerWatts) / 1000) * hours;
  const energy = kwh * pos(s.kwhPrice);
  const labor = pos(input.laborHours) * pos(s.laborHourCost);
  const machine = pos(input.machinePerHour) * hours;
  // Numa falha perde-se filamento, energia e máquina; a mão de obra e a embalagem não.
  const lost = filament + energy + machine;
  const failure = lost / (1 - Math.min(pos(s.failurePct), 90) / 100) - lost;
  const fixed = pos(input.fixedPerHour) * hours;
  const maintenance = machine > 0 ? 0 : (filament + extras + energy + labor) * (pos(s.maintenancePct) / 100);
  const batchCost = filament + extras + energy + labor + machine + failure + fixed + maintenance;
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
  const grams = input.filaments.reduce((t, f) => t + pos(f.grams), 0);
  const channels: ChannelPrice[] = s.channels.map((c) => {
    const rate = pos(c.feePct) / 100;
    const denom = 1 - rate - tax - margin;
    if (denom <= 0) return { name: c.name, price: null, fees: 0, profit: 0, marginPct: 0 };
    const price = (unitCost + pos(c.feeFixed) + freight) / denom;
    const fees = price * (rate + tax) + pos(c.feeFixed);
    const profit = price - fees - unitCost - freight;
    return { name: c.name, price: round2(price), fees: round2(fees), profit: round2(profit), marginPct: round2((profit / price) * 100) };
  });

  // Arredonda só no fim, para o centavo.
  return {
    filament: round2(filament),
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
