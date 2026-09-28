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
