import { heightfieldMesh } from "./heightfield";
import type { Model } from "./types";

/*
 * Relevo (baixo-relevo) a partir de foto (#103, 1ª versão): a altura vem da luminância, com suavização, gama,
 * realce de bordas, fundo plano fora do sujeito e moldura. Impresso deitado, numa cor só (pedra, gesso, metal).
 * A 2ª versão (profundidade por IA local) fica para depois: só troca a origem de `luma`.
 */
export type ReliefParams = {
  /** Altura do relevo acima da base (mm). */
  depth: number;
  /** Espessura da base lisa embaixo (mm). */
  base: number;
  /** Raio da suavização (mm); 0 = sem. */
  smooth: number;
  /** Gama da luminância: > 1 escurece (relevo mais baixo nos tons médios). */
  gamma: number;
  /** Realce de bordas, 0 a 1. */
  edge: number;
  /** Claro = baixo (para fundo claro com sujeito escuro). */
  invert: boolean;
  /** Moldura lisa e alta em volta (mm). */
  border: number;
  color: string;
};

export const DEFAULT_RELIEF: ReliefParams = { depth: 3, base: 1.2, smooth: 0.6, gamma: 1, edge: 0.4, invert: false, border: 3, color: "#c9c5bd" };

const EDGE_SCALE_MM = 3; // o realce compara cada ponto com a média numa vizinhança deste tamanho
const EDGE_GAIN = 1.5;
const CLIP = 0.02; // 2% de cada ponta fica de fora ao esticar o contraste

/** Desfoque de caixa separável com borda repetida; raio em pontos. */
function blur(a: Float32Array, cols: number, rows: number, radius: number): Float32Array {
  if (radius < 1) return a.slice();
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  const win = 2 * radius + 1;
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += a[r * cols + Math.min(cols - 1, Math.max(0, k))];
    for (let c = 0; c < cols; c++) {
      tmp[r * cols + c] = sum / win;
      sum += a[r * cols + Math.min(cols - 1, c + radius + 1)] - a[r * cols + Math.max(0, c - radius)];
    }
  }
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(rows - 1, Math.max(0, k)) * cols + c];
    for (let r = 0; r < rows; r++) {
      out[r * cols + c] = sum / win;
      sum += tmp[Math.min(rows - 1, r + radius + 1) * cols + c] - tmp[Math.max(0, r - radius) * cols + c];
    }
  }
  return out;
}

/** Estica o contraste entre os percentis `CLIP` e `1 − CLIP` dos pontos em `counts`. */
function stretch(a: Float32Array, counts: (i: number) => boolean): Float32Array {
  const vals: number[] = [];
  for (let i = 0; i < a.length; i++) if (counts(i)) vals.push(a[i]);
  if (!vals.length) return a.map(() => 0);
  vals.sort((x, y) => x - y);
  const lo = vals[Math.floor(vals.length * CLIP)], hi = vals[Math.min(vals.length - 1, Math.ceil(vals.length * (1 - CLIP)) - 1)];
  const span = hi - lo;
  return a.map((v) => (span > 1e-6 ? Math.min(1, Math.max(0, (v - lo) / span)) : 0.5));
}

/** Altura (mm) por ponto: base + relevo; `mask` 1 = sujeito (0 fica plano na base); a moldura vai à altura máxima. */
export function reliefHeights(luma: Float32Array, cols: number, rows: number, cell: number, p: ReliefParams, mask?: Uint8Array | null): Float32Array {
  const g = luma.map((l) => Math.pow(Math.min(1, Math.max(0, l)), p.gamma));
  const soft = blur(g, cols, rows, Math.round(p.smooth / cell));
  let shaped = soft;
  if (p.edge > 0) {
    const wide = blur(soft, cols, rows, Math.max(1, Math.round(EDGE_SCALE_MM / cell)));
    shaped = soft.map((v, i) => v + EDGE_GAIN * p.edge * (v - wide[i]));
  }
  const b = Math.round(p.border / cell);
  const inFrame = (i: number) => {
    const r = Math.floor(i / cols), c = i % cols;
    return r < b || r >= rows - b || c < b || c >= cols - b;
  };
  const norm = stretch(shaped, (i) => !inFrame(i) && (!mask || mask[i] === 1));
  const out = new Float32Array(luma.length);
  for (let i = 0; i < out.length; i++) {
    if (inFrame(i)) out[i] = p.base + p.depth;
    else if (mask && mask[i] !== 1) out[i] = p.base;
    else out[i] = p.base + (p.invert ? 1 - norm[i] : norm[i]) * p.depth;
  }
  return out;
}

/** Placa de relevo deitada (z para cima), numa peça de uma cor só. */
export function buildRelief(luma: Float32Array, cols: number, rows: number, cell: number, p: ReliefParams, mask?: Uint8Array | null): Model {
  const mesh = heightfieldMesh(reliefHeights(luma, cols, rows, cell, p, mask), cols, rows, cell);
  return { name: "Relevo", parts: [{ name: "Relevo", color: p.color, mesh }] };
}
