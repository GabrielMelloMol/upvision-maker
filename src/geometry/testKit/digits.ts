import type { ManifoldToplevel, Solid } from "../manifold";

export type K = <D extends { delete(): void }>(o: D) => D;

const W = 3.2, H = 5.5, T = 0.9;
/** Sete segmentos: a topo, b e c direita (cima, baixo), d base, e e f esquerda (baixo, cima), g meio. */
const SEG: Record<string, [number, number, number, number]> = {
  a: [0, H - T, W, T],
  b: [W - T, H / 2, T, H / 2],
  c: [W - T, 0, T, H / 2],
  d: [0, 0, W, T],
  e: [0, 0, T, H / 2],
  f: [0, H / 2, T, H / 2],
  g: [0, H / 2 - T / 2, W, T],
};
const DIGITS: Record<number, string> = { 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg" };

export const TAG = { w: 11, d: 8, base: 1.2, raise: 0.6 };

/** O número `n` (1 a 9) em relevo, centrado na origem, com `raise` mm de altura a partir de z = 0. */
export function digit(M: ManifoldToplevel, k: K, n: number, raise = TAG.raise): Solid {
  const segs = (DIGITS[n] ?? "g").split("").map((s) => {
    const [x, y, w, h] = SEG[s];
    return k(k(M.Manifold.cube([w, h, raise])).translate([x - W / 2, y - H / 2, 0]));
  });
  return k(M.Manifold.union(segs));
}

/** Etiqueta solta com o número em relevo: placa de 1,2 mm e o dígito por cima, centrada na origem, assentada em z = 0. */
export function tag(M: ManifoldToplevel, k: K, n: number): Solid {
  const plate = k(k(M.Manifold.cube([TAG.w, TAG.d, TAG.base], true)).translate([0, 0, TAG.base / 2]));
  const d = k(digit(M, k, n).translate([0, 0, TAG.base - 0.01]));
  return k(M.Manifold.union([plate, d]));
}
