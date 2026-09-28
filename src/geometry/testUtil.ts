import { meshBounds } from "./bounds";
import type { Mesh, Model } from "./types";

/** Volume de malha fechada (teorema da divergência). */
export function volume(m: Mesh): number {
  let v = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
export const modelVolume = (m: Model) => m.parts.reduce((s, p) => s + volume(p.mesh), 0);
export function modelSize(m: Model): [number, number, number] {
  const b = meshBounds(m.parts.map((p) => p.mesh))!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}
export const sq = (c: number, x = 0, y = 0): [number, number][] => [[x - c, y - c], [x + c, y - c], [x + c, y + c], [x - c, y + c]];
