import type { Font } from "opentype.js";
import type { ManifoldToplevel } from "./manifold";
import { textToCrossSection } from "./text";

/**
 * Texturas feitas de frase ou de imagem (#222): um ladrilho quadrado de alturas 0..1 (GRID × GRID) que o texturizador
 * repete pela superfície, como as texturas de padrão.
 */
export const GRID = 128;
const PAD = 0.12; // folga em volta da frase, em fração do ladrilho
const TEXT_H = 10;

type Poly = [number, number][];

/** Preenche (par-ímpar) os polígonos numa grade cols × rows cobrindo a caixa; 1 = dentro. */
export function rasterize(polys: Poly[], box: { x0: number; y0: number; x1: number; y1: number }, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  const [sx, sy] = [(box.x1 - box.x0) / cols, (box.y1 - box.y0) / rows];
  for (let j = 0; j < rows; j++) {
    const y = box.y0 + (j + 0.5) * sy;
    const xs: number[] = [];
    for (const p of polys)
      for (let i = 0; i < p.length; i++) {
        const [a, b] = [p[i], p[(i + 1) % p.length]];
        if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    xs.sort((m, n) => m - n);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const [i0, i1] = [Math.max(0, Math.ceil((xs[q] - box.x0) / sx - 0.5)), Math.min(cols - 1, Math.floor((xs[q + 1] - box.x0) / sx - 0.5))];
      for (let i = i0; i <= i1; i++) out[j * cols + i] = 1;
    }
  }
  return out;
}

/** Abre os cantos: média de 3 × 3 (a frase fica com borda suave, sem degrau de pixel no relevo). */
function blur(g: Float32Array, n: number): Float32Array {
  const out = new Float32Array(g.length);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += g[((j + dj + n) % n) * n + ((i + di + n) % n)];
      out[j * n + i] = s / 9;
    }
  return out;
}

/** A frase no meio de um ladrilho quadrado (a linha de baixo da grade é o "baixo" da frase: o eixo Y da textura sobe). */
export function textGrid(M: ManifoldToplevel, font: Font, text: string): Float32Array {
  const cs = textToCrossSection(M, font, text, TEXT_H);
  try {
    const b = cs.bounds();
    const w = b.max[0] - b.min[0];
    const side = w / (1 - 2 * PAD); // o ladrilho é quadrado: a frase ocupa a largura menos a folga
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const g = rasterize(cs.toPolygons() as Poly[], { x0: cx - side / 2, y0: cy - side / 2, x1: cx + side / 2, y1: cy + side / 2 }, GRID, GRID);
    return blur(g, GRID);
  } finally {
    cs.delete();
  }
}

/** Imagem → ladrilho quadrado: recorta o centro e usa o brilho (claro = alto), com a opção de inverter. */
export function imageGrid(luma: Float32Array, w: number, h: number, invert: boolean): Float32Array {
  const side = Math.min(w, h);
  const [ox, oy] = [Math.floor((w - side) / 2), Math.floor((h - side) / 2)];
  const out = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const v = luma[(oy + Math.min(side - 1, Math.floor(((j + 0.5) / GRID) * side))) * w + ox + Math.min(side - 1, Math.floor(((i + 0.5) / GRID) * side))];
      out[j * GRID + i] = invert ? 1 - v : v;
    }
  return out;
}
