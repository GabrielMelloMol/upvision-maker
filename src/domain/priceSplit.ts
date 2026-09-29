import type { CalcResult } from "./calc";
import { money, round2 } from "./format";

export type SplitPart = { key: "production" | "labor" | "fees" | "freight" | "profit"; label: string; value: number; pct: number; detail?: string };

/**
 * Para onde vai cada real do preço de UMA peça: produção (filamento, energia, máquina, falhas, extras, fixos),
 * mão de obra, taxas e impostos do canal, frete e lucro. As partes somam o preço; com prejuízo o lucro fica 0
 * e `loss` diz quanto falta.
 */
export function priceSplit(r: CalcResult, sale: { price: number; fees: number; profit: number }, freight: number): { parts: SplitPart[]; loss: number } {
  const perUnit = r.batchCost > 0 ? r.unitCost / r.batchCost : 0; // os campos do CalcResult são da mesa inteira
  const labor = r.labor * perUnit;
  const production = r.unitCost - labor;
  const detail = (
    [
      ["Filamento", r.filament],
      ["Energia", r.energy],
      ["Máquina", r.machine],
      ["Falhas", r.failure],
      ["Extras", r.extras],
      ["Custos fixos", r.fixed],
      ["Manutenção", r.maintenance],
    ] as const
  )
    .filter(([, v]) => v > 0)
    .map(([l, v]) => `${l} ${money(round2(v * perUnit))}`)
    .join(" · ");
  const raw: Omit<SplitPart, "pct">[] = [
    { key: "production", label: "Produção", value: production, detail: detail || undefined },
    { key: "labor", label: "Mão de obra", value: labor },
    { key: "fees", label: "Taxas e impostos", value: sale.fees },
    { key: "freight", label: "Frete", value: freight },
    { key: "profit", label: "Lucro", value: Math.max(0, sale.profit) },
  ];
  const total = raw.reduce((t, p) => t + Math.max(0, p.value), 0);
  const parts = raw
    .filter((p) => p.value > 0)
    .map((p) => ({ ...p, value: round2(p.value), pct: total > 0 ? Math.round((p.value / total) * 1000) / 10 : 0 }));
  return { parts, loss: sale.profit < 0 ? round2(-sale.profit) : 0 };
}
