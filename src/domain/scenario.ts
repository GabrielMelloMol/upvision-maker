import type { CalcResult } from "./calc";
import { round2 } from "./format";
import { PRICE_NAMES, type ChannelRow } from "./pricing";

/** O que se compara entre dois cenários da calculadora (#44), por peça e na venda direta. */
export type ScenarioSummary = { name: string; unitCost: number; price: number; profit: number; profitPerHour: number | null; grams: number; hours: number };

export function scenarioSummary(name: string, r: CalcResult, rows: ChannelRow[], grams: number, hours: number): ScenarioSummary {
  const direct = rows.find((x) => x.name === PRICE_NAMES.consumer.name);
  return { name, unitCost: r.unitCost, price: direct?.price ?? r.consumer, profit: direct?.profit ?? 0, profitPerHour: direct?.profitPerHour ?? null, grams, hours };
}

export type ScenarioLine = { label: string; a: number | null; b: number | null; diff: number | null; unit: "money" | "g" | "h" | "money/h"; higherIsBetter: boolean | null };

/** Linhas da comparação A × B; `diff` = B − A (null quando falta um lado). */
export function compareScenarios(a: ScenarioSummary, b: ScenarioSummary): ScenarioLine[] {
  const line = (label: string, x: number | null, y: number | null, unit: ScenarioLine["unit"], higherIsBetter: boolean | null): ScenarioLine => ({
    label,
    a: x,
    b: y,
    diff: x === null || y === null ? null : round2(y - x),
    unit,
    higherIsBetter,
  });
  return [
    line("Filamento", a.grams, b.grams, "g", null),
    line("Tempo de impressão", a.hours, b.hours, "h", null),
    line("Custo por peça", a.unitCost, b.unitCost, "money", false),
    line("Preço (venda direta)", a.price, b.price, "money", null),
    line("Lucro por peça", a.profit, b.profit, "money", true),
    line("Lucro por hora", a.profitPerHour, b.profitPerHour, "money/h", true),
  ];
}
