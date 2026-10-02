/**
 * Relatório da varredura de QA (#90). Os resultados ficam em docs/qa-modelos.json (chave = "id:variante") e cada
 * rodada só substitui os casos que rodou: cada dono roda a sua parte e o docs/QA-modelos.md sai com tudo.
 */
export type QaStatus = "ok" | "aviso" | "falha" | "n/a";
export type QaRow = {
  key: string;
  owner: string;
  group: string;
  label: string;
  variant: string;
  status: QaStatus;
  reasons: string[];
  minutes?: number;
  grams?: number;
  plates?: number;
  pauses?: string;
  /** Resultado em cada fatiador, ex.: "Bambu ✓ · Orca ✓ · Projeto Bambu ✓". */
  slicers?: string;
  date: string;
};

export const statusOf = (fails: string[], warns: string[], na = false): QaStatus => (na ? "n/a" : fails.length ? "falha" : warns.length ? "aviso" : "ok");

export function mergeRows(old: QaRow[], fresh: QaRow[]): QaRow[] {
  const byKey = new Map(old.map((r) => [r.key, r]));
  for (const r of fresh) byKey.set(r.key, r);
  return [...byKey.values()].sort((a, b) => a.owner.localeCompare(b.owner) || a.group.localeCompare(b.group) || a.key.localeCompare(b.key));
}

const ICON: Record<QaStatus, string> = { ok: "✅ ok", aviso: "⚠️ aviso", falha: "❌ falha", "n/a": "➖ n/a" };
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const num = (n: number | undefined, d = 0) => (n === undefined ? "–" : n.toFixed(d).replace(".", ","));

export function renderReport(rows: QaRow[], header: string): string {
  const owners = [...new Set(rows.map((r) => r.owner))];
  const count = (s: QaStatus) => rows.filter((r) => r.status === s).length;
  const lines = [header, "", `**Total:** ${rows.length} casos · ${count("ok")} ok · ${count("aviso")} com aviso · ${count("falha")} com falha · ${count("n/a")} n/a`, ""];
  for (const owner of owners) {
    lines.push(`## ${owner}`, "", "| Modelo | Valores | Resultado | Fatiadores | Tempo (min) | PLA (g) | Placas | Pausas (Z) | Motivo |", "|---|---|---|---|---:|---:|---:|---|---|");
    for (const r of rows.filter((x) => x.owner === owner))
      lines.push(`| ${cell(r.label)} | ${r.variant} | ${ICON[r.status]} | ${r.slicers ?? "–"} | ${num(r.minutes)} | ${num(r.grams, 1)} | ${r.plates ?? "–"} | ${r.pauses ?? "–"} | ${cell(r.reasons.join("; ")) || "–"} |`);
    lines.push("");
  }
  return lines.join("\n");
}
