import { z } from "zod";
import type { Filament } from "./entities";
import { round2 } from "./format";

/**
 * Produção fora de venda (#189): impressão de teste ou amostra e peça que deu erro. Dá baixa nos filamentos na hora e o
 * custo do material entra no Financeiro como perda, separado das vendas (a taxa de falha real).
 */
const id = z.number().int().positive();

export const WASTE_KINDS = ["sample", "failure"] as const;
export type WasteKind = (typeof WASTE_KINDS)[number];
export const WASTE_LABEL: Record<WasteKind, string> = { sample: "Amostra ou teste", failure: "Erro de impressão" };

export const WasteLine = z.object({ filamentId: id, grams: z.number().positive("Informe as gramas") });
export type WasteLine = z.infer<typeof WasteLine>;

export const WasteRunInput = z.object({
  kind: z.enum(WASTE_KINDS),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  productId: id.nullable(),
  printerId: id.nullable(),
  lines: z.array(WasteLine).min(1, "Informe pelo menos um filamento"),
  notes: z.string().trim().max(500),
});
export type WasteRunInput = z.infer<typeof WasteRunInput>;
export type WasteRun = WasteRunInput & { id: number; cost: number };

/** Custo do material gasto, pelo preço por kg de cada filamento no momento do registro. */
export function wasteCost(lines: WasteLine[], filaments: Pick<Filament, "id" | "pricePerKg">[]): number {
  return round2(lines.reduce((s, l) => s + (l.grams * (filaments.find((f) => f.id === l.filamentId)?.pricePerKg ?? 0)) / 1000, 0));
}

export const wasteIn = (runs: Pick<WasteRun, "at" | "cost" | "kind">[], from: string, to: string) => runs.filter((r) => r.at >= from && r.at <= to);

/** Total perdido no período, por tipo. */
export function wasteTotals(runs: Pick<WasteRun, "at" | "cost" | "kind">[], from: string, to: string) {
  const inRange = wasteIn(runs, from, to);
  const sum = (kind: WasteKind) => round2(inRange.filter((r) => r.kind === kind).reduce((s, r) => s + r.cost, 0));
  const sample = sum("sample");
  const failure = sum("failure");
  return { sample, failure, total: round2(sample + failure) };
}

/** Parte do custo de produção que se perdeu em erros (%), ou null sem produção nem erro no período. */
export function failureShare(failureCost: number, cogs: number): number | null {
  const all = failureCost + cogs;
  return all > 0 ? Math.round((failureCost / all) * 1000) / 10 : null;
}
