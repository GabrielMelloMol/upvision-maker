/** estimatedDiameterMm: as gramas vieram dos metros (fatiador sem peso); refazer com a densidade do material escolhido. */
export type SlicerFilament = { index: number; type?: string; color?: string; grams?: number; meters?: number; estimatedDiameterMm?: number };

/** O que foi lido de um arquivo de fatiador (tudo opcional: cada fatiador informa coisas diferentes). */
export type SlicerReport = {
  source: string;
  printer?: string;
  seconds?: number;
  pieces?: number;
  filaments: SlicerFilament[];
  warnings: string[];
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1d 2h 3m 4s", "34m 51s", "45m 12s" → segundos. */
export function parseDuration(s: string): number | undefined {
  const re = /(\d+(?:\.\d+)?)\s*([dhms])/g;
  let total = 0;
  let found = false;
  for (const [, n, u] of s.matchAll(re)) {
    found = true;
    total += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[u as "d" | "h" | "m" | "s"];
  }
  return found ? Math.round(total) : undefined;
}

export const splitList = (v: string | undefined) => (v ? v.split(/[;,]/).map((x) => x.trim()).filter(Boolean) : []);
export const numList = (v: string | undefined) => splitList(v).map(Number).filter((n) => Number.isFinite(n));
