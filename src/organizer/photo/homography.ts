/** Ponto 2D [x, y]. */
export type Pt = [number, number];
/** Matriz 3×3 em linha (9 números), h[8] = 1. */
export type Mat3 = number[];

/** Resolve A·x = b por eliminação de Gauss com pivô parcial (A n×n). null = sistema singular. */
export function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = m[r][c] / m[c][c];
      for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Homografia que leva cada `from[i]` em `to[i]` (4 pares, sem 3 alinhados). */
export function homography(from: Pt[], to: Pt[]): Mat3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  from.forEach(([x, y], i) => {
    const [u, v] = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  });
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

export function apply(h: Mat3, [x, y]: Pt): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function invert(h: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, i, j] = h;
  const inv = [e * j - f * i, c * i - b * j, b * f - c * e, f * g - d * j, a * j - c * g, c * d - a * f, d * i - e * g, b * g - a * i, a * e - b * d];
  return inv.map((v) => v / inv[8]);
}
