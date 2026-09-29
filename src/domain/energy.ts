import { z } from "zod";

/** Adicional das bandeiras tarifárias (ANEEL, R$ por kWh, sem impostos). Fonte: gov.br/aneel — bandeiras tarifárias. */
export const BILL_FLAGS = [
  { id: "verde", label: "Verde", extra: 0 },
  { id: "amarela", label: "Amarela", extra: 0.01885 },
  { id: "vermelha1", label: "Vermelha 1", extra: 0.04463 },
  { id: "vermelha2", label: "Vermelha 2", extra: 0.07877 },
] as const;
export type BillFlag = (typeof BILL_FLAGS)[number]["id"];

export const KwhEntrySchema = z.object({
  month: z.string(), // "2026-09"
  total: z.number(),
  kwh: z.number(),
  flag: z.enum(["verde", "amarela", "vermelha1", "vermelha2"]),
  price: z.number(),
});
export type KwhEntry = z.infer<typeof KwhEntrySchema>;

const HISTORY_MAX = 12;
const MIN_PLAUSIBLE = 0.3; // R$/kWh: abaixo disso, quase sempre campos trocados
const MAX_PLAUSIBLE = 3;

/** Preço do kWh pela conta de luz: valor total ÷ kWh consumidos + adicional da bandeira escolhida. */
export function kwhFromBill(total: number, kwh: number, flag: BillFlag): number | null {
  if (!(total > 0) || !(kwh > 0)) return null;
  const extra = BILL_FLAGS.find((f) => f.id === flag)!.extra;
  return Math.round((total / kwh + extra) * 100) / 100;
}

export function kwhWarning(price: number): string | null {
  return price < MIN_PLAUSIBLE || price > MAX_PLAUSIBLE ? "Valor fora do comum (costuma ficar entre R$ 0,60 e R$ 1,30). Confira se o total e os kWh não foram trocados." : null;
}

/** Guarda o cálculo no histórico (mais recente primeiro; um por mês). */
export function addKwhHistory(history: KwhEntry[], e: KwhEntry): KwhEntry[] {
  return [e, ...history.filter((h) => h.month !== e.month)].slice(0, HISTORY_MAX);
}

const SHORT_PRINT_H = 1;
/** Acima disso (±50%) a medição provavelmente pegou outra coisa: aquecimento, câmara, secador. */
const FAR_FROM_CATALOG = 0.5;

/**
 * W médio medido com tomada inteligente: o contador Total (kWh) no início e no fim de uma impressão.
 * O W instantâneo do app não serve: vai de ~6 W parada a 300 W+ aquecendo a mesa.
 */
export function plugWatts(m: { startKwh: number; endKwh: number; hours: number }, catalogWatts?: number): { watts: number | null; warnings: string[] } {
  const kwh = m.endKwh - m.startKwh;
  if (!(kwh > 0) || !(m.hours > 0)) return { watts: null, warnings: [] };
  const watts = Math.round((kwh / m.hours) * 1000);
  const warnings: string[] = [];
  if (m.hours < SHORT_PRINT_H) warnings.push("Impressão de menos de 1 hora: o aquecimento da mesa pesa demais. Meça uma impressão mais longa.");
  if (catalogWatts && Math.abs(watts - catalogWatts) / catalogWatts > FAR_FROM_CATALOG)
    warnings.push(`Bem diferente do catálogo (${catalogWatts} W). Confira os números do app da tomada.`);
  return { watts, warnings };
}

/** Acima de 2× o consumo médio do catálogo, o número digitado quase sempre é o da fonte (etiqueta), não o consumo. */
export const PSU_FACTOR = 2;
export const looksLikePsuWatts = (typed: number, catalogWatts: number | undefined): catalogWatts is number =>
  !!catalogWatts && catalogWatts > 0 && typed > PSU_FACTOR * catalogWatts;
