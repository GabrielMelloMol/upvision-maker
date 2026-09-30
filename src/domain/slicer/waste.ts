import { round2 } from "./types";

/**
 * Desperdício de impressão multicor (#147): a cada troca de filamento o bico purga (flush) o volume da matriz do
 * fatiador (`flush_volumes_matrix[de][para]` × `flush_multiplier`, em mm³), cobrado do filamento que entra.
 *
 * Conferido no 3MF real da A1 (tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf): uma troca azul → branco purga
 * 616 mm³ (≈ 0,78 g), mas o `used_g` do branco inteiro é 0,55 g. Logo o `used_g` do Bambu Studio NÃO inclui a
 * purga e ela entra à parte. O PrusaSlicer/Orca já somam a torre de limpeza ao "filament used" e informam quanto
 * foi para a torre: aí só mostramos, sem somar de novo.
 */
export type SlicerWaste = {
  /** Gramas purgadas por filamento (índice do fatiador, a partir de 1). */
  byFilament: { index: number; grams: number }[];
  grams: number;
  swaps: number;
  /** true = as gramas já estão dentro do consumo dos filamentos (só informativo). */
  included: boolean;
  /** Trocas contadas no G-code ou estimadas pelas camadas (3MF sem G-code dentro). */
  from: "gcode" | "camadas" | "torre";
};

/** Matriz n×n (mm³) a partir da lista "0,616,229,0" (linha = de, coluna = para). */
export function flushMatrix(values: number[]): number[][] | null {
  const n = Math.round(Math.sqrt(values.length));
  if (n < 2 || n * n !== values.length) return null;
  return Array.from({ length: n }, (_, i) => values.slice(i * n, i * n + n));
}

/** Sequência de filamentos (0-based) carregados no G-code do Bambu (M620 S<n>A) ou de fatiador com T<n>. */
export function toolSequence(gcode: string): number[] {
  const seq: number[] = [];
  const re = /^(?:M620 S(\d+)A|T(\d+))\s*(?:;.*)?$/gm;
  for (const m of gcode.matchAll(re)) {
    const t = Number(m[1] ?? m[2]);
    if (t < 255 && seq[seq.length - 1] !== t) seq.push(t); // 255 = descarregar no fim
  }
  return seq;
}

/**
 * Sem o G-code: ordem das trocas pelas listas de filamentos por camada do 3MF (`layer_filament_list`). Cada camada
 * começa pelo filamento em que a anterior terminou (como o fatiador faz) e segue a ordem da lista.
 */
export function sequenceFromLayers(ranges: { filaments: number[]; from: number; to: number }[]): number[] {
  const layers = new Map<number, number[]>();
  for (const r of ranges) for (let l = r.from; l <= r.to; l++) layers.set(l, [...(layers.get(l) ?? []), ...r.filaments]);
  const seq: number[] = [];
  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    const set = [...new Set(layers.get(l))];
    const last = seq[seq.length - 1];
    const order = set.includes(last) ? [last, ...set.filter((f) => f !== last)] : set;
    for (const f of order) if (seq[seq.length - 1] !== f) seq.push(f);
  }
  return seq;
}

/** Purga de cada troca da sequência, em gramas por filamento (densidade g/cm³ de cada um). */
export function purgeWaste(seq: number[], matrix: number[][], multiplier: number, density: (i: number) => number, from: SlicerWaste["from"]): SlicerWaste | null {
  const byIndex = new Map<number, number>();
  let swaps = 0;
  for (let i = 1; i < seq.length; i++) {
    const mm3 = (matrix[seq[i - 1]]?.[seq[i]] ?? 0) * (multiplier || 1);
    if (!mm3) continue;
    swaps++;
    byIndex.set(seq[i], (byIndex.get(seq[i]) ?? 0) + (mm3 / 1000) * density(seq[i]));
  }
  if (!swaps) return null;
  const byFilament = [...byIndex].map(([i, g]) => ({ index: i + 1, grams: round2(g) })).sort((a, b) => a.index - b.index);
  return { byFilament, grams: round2(byFilament.reduce((s, f) => s + f.grams, 0)), swaps, included: false, from };
}
