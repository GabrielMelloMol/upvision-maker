import { rng } from "./snowflake";

/** Tipos de encaixe (#159). "straight" = peças quadradas, sem orelha. */
export const KNOBS = ["classic", "round", "square", "wave", "triangle", "straight"] as const;
export type Knob = (typeof KNOBS)[number];
export type Pt = [number, number];

export type CutOptions = {
  cols: number;
  rows: number;
  cell: number; // lado da peça, mm
  knob: Knob;
  size: number; // altura da orelha em fração do lado (0,15 a 0,3)
  seed: number;
  random: boolean; // cada aresta com lado, posição e tamanho sorteados pela semente
};

const ARC_SEG = 24;
const WAVE_SEG = 24;
const WAVE_SPAN = 0.6; // trecho da aresta com a onda
const JIT_T = 0.06; // quanto a orelha anda ao longo da aresta (fração do lado)
const JIT_S = 0.12; // variação do tamanho

/** Arco do círculo (centro c, raio r) por cima, do ponto de baixo à esquerda ao de baixo à direita, em x = c ± w. */
function overArc(cx: number, cy: number, r: number, w: number): Pt[] {
  const s = Math.sqrt(r * r - w * w);
  const a0 = Math.atan2(-s, -w) + 2 * Math.PI, a1 = Math.atan2(-s, w);
  return Array.from({ length: ARC_SEG + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / ARC_SEG;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });
}

/** Aresta de (0,0) a (1,0) com a orelha para +y, altura máxima `h`, centrada em `c` (coordenadas em fração do lado). */
function profile(knob: Knob, c: number, h: number): Pt[] {
  switch (knob) {
    case "classic": {
      // pescoço estreito + cabeça redonda: a cabeça mais larga que o pescoço é o que trava
      const r = h * 0.42, w = r * 0.55, cy = h - r;
      const neck = cy - Math.sqrt(r * r - w * w);
      return [[0, 0], [c - w, 0], [c - w, neck], ...overArc(c, cy, r, w), [c + w, neck], [c + w, 0], [1, 0]];
    }
    case "round": {
      // bolinha: círculo saindo direto da aresta, centro acima dela (trava sem pescoço)
      const r = h / 1.45, cy = 0.45 * r;
      return [[0, 0], ...overArc(c, cy, r, Math.sqrt(r * r - cy * cy)), [1, 0]];
    }
    case "square": {
      const w = h * 0.5;
      return [[0, 0], [c - w, 0], [c - w, h], [c + w, h], [c + w, 0], [1, 0]];
    }
    case "triangle": {
      const w = h * 0.7;
      return [[0, 0], [c - w, 0], [c, h], [c + w, 0], [1, 0]];
    }
    case "wave": {
      // uma onda inteira no meio da aresta (sobe de um lado, desce do outro); as pontas ficam retas para as ondas
      // de duas arestas não se cruzarem no canto
      const a = c - WAVE_SPAN / 2;
      const wave = Array.from({ length: WAVE_SEG + 1 }, (_, i) => [a + (WAVE_SPAN * i) / WAVE_SEG, h * Math.sin((2 * Math.PI * i) / WAVE_SEG)] as Pt);
      return [[0, 0], ...wave, [1, 0]];
    }
    case "straight":
      return [[0, 0], [1, 0]];
  }
}

/** Quanto a orelha passa da aresta, em mm (para afastar as peças na mesa sem uma entrar na outra). */
export const knobDepth = (o: CutOptions) => (o.knob === "straight" ? 0 : o.size * (o.random ? 1 + JIT_S : 1) * o.cell);

/** Aresta de p0 a p1 (lado `cell`) com a orelha para a esquerda de quem anda (sign = 1) ou para a direita (−1). */
function edge(o: CutOptions, p0: Pt, p1: Pt, sign: number, rand: (() => number) | null): Pt[] {
  const t = rand ? 0.5 + (rand() * 2 - 1) * JIT_T : 0.5;
  const h = o.size * (rand ? 1 + (rand() * 2 - 1) * JIT_S : 1);
  const dx = (p1[0] - p0[0]) / o.cell, dy = (p1[1] - p0[1]) / o.cell;
  return profile(o.knob, t, h).map(([u, v]) => [p0[0] + o.cell * (u * dx - v * sign * dy), p0[1] + o.cell * (u * dy + v * sign * dx)]);
}

/**
 * Polígonos das peças [linha][coluna] (linha 0 em cima), anti-horários, grade centrada na origem. Cada aresta interna é
 * gerada uma vez e usada ao contrário pela vizinha: encaixe exato (a folga vem depois, encolhendo cada peça).
 * Borda reta. Com `random`, a semente sorteia lado, posição e tamanho de cada orelha; sem, as orelhas alternam.
 */
export function puzzleGrid(o: CutOptions): Pt[][][] {
  const rand = o.random ? rng(o.seed) : null;
  const sideOf = (alt: boolean) => (rand ? (rand() < 0.5 ? 1 : -1) : alt ? 1 : -1);
  const W = o.cols * o.cell, H = o.rows * o.cell;
  const X = (c: number) => -W / 2 + c * o.cell, Y = (r: number) => H / 2 - r * o.cell;
  // h[r][c]: linha r de bordas (y = Y(r)), da esquerda para a direita; v[r][c]: coluna c de bordas, de baixo para cima
  const h = Array.from({ length: o.rows + 1 }, (_, r) =>
    Array.from({ length: o.cols }, (_, c): Pt[] => {
      const a: Pt = [X(c), Y(r)], b: Pt = [X(c + 1), Y(r)];
      return r === 0 || r === o.rows ? [a, b] : edge(o, a, b, sideOf((r + c) % 2 === 0), rand);
    }),
  );
  const v = Array.from({ length: o.rows }, (_, r) =>
    Array.from({ length: o.cols + 1 }, (_, c): Pt[] => {
      const a: Pt = [X(c), Y(r + 1)], b: Pt = [X(c), Y(r)];
      return c === 0 || c === o.cols ? [a, b] : edge(o, a, b, sideOf((r + c) % 2 === 1), rand);
    }),
  );
  const open = (e: Pt[]) => e.slice(0, -1);
  return Array.from({ length: o.rows }, (_, r) =>
    Array.from({ length: o.cols }, (_, c) => [...open(h[r + 1][c]), ...open(v[r][c + 1]), ...open([...h[r][c]].reverse()), ...open([...v[r][c]].reverse())]),
  );
}
