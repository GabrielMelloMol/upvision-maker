import { round2 } from "./format";
import type { Settings } from "./settings";

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
}

export interface ChannelPrice {
  name: string;
  price: number | null; // null = taxa + margem ≥ 100%
  fees: number;
  profit: number;
  marginPct: number;
}

/** Negativo, NaN ou infinito vira 0. */
const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calculate(input: CalcInput, s: Settings) {
  const filament = input.filaments.reduce((t, f) => t + (pos(f.pricePerKg) / 1000) * pos(f.grams), 0);
  const extras = input.extras.reduce((t, e) => t + pos(e.unitPrice) * pos(e.qty), 0);
  const energy = (pos(input.printerWatts) / 1000) * pos(input.printHours) * pos(s.kwhPrice);
  const labor = pos(input.laborHours) * pos(s.laborHourCost);
  const subtotal = filament + extras + energy + labor;
  const maintenance = subtotal * (pos(s.maintenancePct) / 100);
  const batchCost = subtotal + maintenance;
  const qty = Math.max(1, Math.floor(pos(input.quantity)));
  const unitCost = batchCost / qty;
  const freight = pos(input.freight);
  const resale = unitCost * s.multResale + freight;
  const consumer = unitCost * s.multConsumer + freight;
  const margin = pos(input.marketplaceMarginPct) / 100;

  const channels: ChannelPrice[] = s.channels.map((c) => {
    const rate = pos(c.feePct) / 100;
    const denom = 1 - rate - margin;
    if (denom <= 0) return { name: c.name, price: null, fees: 0, profit: 0, marginPct: 0 };
    const price = (unitCost + pos(c.feeFixed) + freight) / denom;
    const fees = price * rate + pos(c.feeFixed);
    const profit = price - fees - unitCost - freight;
    return { name: c.name, price: round2(price), fees: round2(fees), profit: round2(profit), marginPct: round2((profit / price) * 100) };
  });

  // Arredonda só no fim, para o centavo.
  return {
    filament: round2(filament),
    extras: round2(extras),
    energy: round2(energy),
    labor: round2(labor),
    maintenance: round2(maintenance),
    batchCost: round2(batchCost),
    unitCost: round2(unitCost),
    resale: round2(resale),
    consumer: round2(consumer),
    resaleProfit: round2(resale - unitCost - freight),
    consumerProfit: round2(consumer - unitCost - freight),
    channels,
  };
}
export type CalcResult = ReturnType<typeof calculate>;
