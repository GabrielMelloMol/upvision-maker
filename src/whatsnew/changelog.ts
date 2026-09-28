export type ChangelogEntry = { version: string; date: string; items: string[] };

const HEADING = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+?))?\s*$/;
const ITEM = /^\s*[-*]\s+(.+?)\s*$/;

/** CHANGELOG.md no formato "## 0.2.0 — 2026-09-28" seguido de itens "- …". */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  for (const line of md.split(/\r?\n/)) {
    const h = HEADING.exec(line);
    if (h) {
      out.push({ version: h[1], date: h[2] ?? "", items: [] });
      continue;
    }
    const it = ITEM.exec(line);
    if (it && out.length) out[out.length - 1].items.push(it[1]);
  }
  return out;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Novidades a mostrar: versões > última vista e ≤ instalada. Primeira instalação não mostra nada. */
export function entriesToShow(entries: ChangelogEntry[], lastSeen: string | null, current: string): ChangelogEntry[] {
  if (!lastSeen) return [];
  return entries.filter((e) => compareVersions(e.version, lastSeen) > 0 && compareVersions(e.version, current) <= 0);
}
