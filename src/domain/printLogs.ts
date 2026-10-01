import { z } from "zod";

/**
 * Ficha de impressão (#163): cada impressão de um produto, com o que foi usado e se deu certo. A taxa de sucesso
 * medida vira a taxa de falha do produto (#35) quando ele não tem uma digitada.
 */
const id = z.number().int().positive();
const nonNeg = z.number().min(0);

export const SUPPORTS = ["nenhum", "normal", "árvore"] as const;

export const PrintLogInput = z.object({
  productId: id.nullable(),
  orderId: id.nullable().default(null),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  printerId: id.nullable().default(null),
  /** Filamentos e slots como a pessoa escreveu ("PLA Azul no slot 1, Branco no 2"). */
  filaments: z.string().trim().max(300).default(""),
  layerHeight: z.number().min(0.04).max(1).nullable().default(null),
  infillPct: z.number().min(0).max(100).nullable().default(null),
  supports: z.enum(SUPPORTS).default("nenhum"),
  brim: z.boolean().default(false),
  orientation: z.string().trim().max(120).default(""),
  /** Tempo e gramas reais (do fatiador ou digitados), da mesa inteira. */
  minutes: nonNeg.nullable().default(null),
  grams: nonNeg.nullable().default(null),
  result: z.enum(["ok", "falhou"]),
  reason: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
});
export type PrintLogInput = z.infer<typeof PrintLogInput>;
export type PrintLog = PrintLogInput & { id: number };

/** A partir de quantas impressões a taxa medida vale como taxa de falha do produto. */
export const MIN_PRINTS = 3;
const MAX_FAILURE = 90;

export function printStats(logs: Pick<PrintLog, "result">[]): { total: number; ok: number; successPct: number | null } {
  const ok = logs.filter((l) => l.result === "ok").length;
  return { total: logs.length, ok, successPct: logs.length ? Math.round((ok / logs.length) * 100) : null };
}

/** Taxa de falha medida (%), ou null com menos de MIN_PRINTS impressões. */
export function measuredFailurePct(logs: Pick<PrintLog, "result">[]): number | null {
  const s = printStats(logs);
  if (s.total < MIN_PRINTS) return null;
  return Math.min(MAX_FAILURE, Math.round(((s.total - s.ok) / s.total) * 100));
}

/** A impressão mais recente que deu certo: o "o que funcionou" da ficha. */
export function lastWorked<T extends Pick<PrintLog, "result" | "at" | "id">>(logs: T[]): T | null {
  return logs.filter((l) => l.result === "ok").sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)[0] ?? null;
}

/** "0,2 mm · 15% · suporte em árvore · brim · deitado" para a ficha e o pedido. */
export function settingsSummary(l: Pick<PrintLog, "layerHeight" | "infillPct" | "supports" | "brim" | "orientation">): string {
  const dec = (n: number) => n.toLocaleString("pt-BR");
  return [
    l.layerHeight != null && `${dec(l.layerHeight)} mm`,
    l.infillPct != null && `${dec(l.infillPct)}%`,
    l.supports !== "nenhum" && (l.supports === "árvore" ? "suporte em árvore" : "suporte"),
    l.brim && "brim",
    l.orientation,
  ]
    .filter(Boolean)
    .join(" · ");
}
