import type { ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import type { Model } from "../types";
import { butterfly, flower, type K } from "./motifs";

export type PiecesParams = {
  /** Borboletas em relevo (peças à parte, para colar). */
  butterflies: number;
  butterflySpan: number;
  /** Flores em relevo. */
  flowers: number;
  flowerR: number;
};

export const DEFAULT_PIECES: PiecesParams = { butterflies: 1, butterflySpan: 40, flowers: 2, flowerR: 11 };

const BASE_T = 1.2;
const TOP_T = 0.6;
const FLOWER_T = 1;
const ROW_GAP = 8;

const shift = (m: Model, dx: number, dy: number): Model => ({ ...m, parts: m.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })) });
const widthOf = (m: Model) => {
  let lo = Infinity, hi = -Infinity;
  for (const q of m.parts)
    for (let i = 0; i < q.mesh.positions.length; i += 3) {
      lo = Math.min(lo, q.mesh.positions[i]);
      hi = Math.max(hi, q.mesh.positions[i]);
    }
  return hi - lo;
};

/** Borboletas e flores em relevo, cada uma num objeto, lado a lado e centradas na origem. As cores vêm da paleta depois. */
export function buildPieces(M: ManifoldToplevel, k: K, p: PiecesParams): Model[] {
  const out: Model[] = [];
  for (let i = 0; i < p.butterflies; i++) {
    const b = butterfly(M, k, p.butterflySpan);
    // base inteira e, por cima, os "olhos" das asas em outro tom (relevo em duas camadas)
    out.push({
      name: `Borboleta ${i + 1}`,
      parts: [
        { name: "Borboleta", color: "#000000", mesh: toMesh(k(b.whole.extrude(BASE_T))) },
        { name: "Detalhe", color: "#000000", mesh: toMesh(k(k(b.eyes.extrude(TOP_T)).translate([0, 0, BASE_T]))) },
      ],
    });
  }
  for (let i = 0; i < p.flowers; i++) {
    const big = flower(M, k, p.flowerR);
    const small = k(flower(M, k, p.flowerR * 0.55).rotate(36));
    const core = k(M.CrossSection.circle(p.flowerR * 0.13, 24));
    out.push({
      name: `Flor ${i + 1}`,
      parts: [
        { name: "Flor", color: "#000000", mesh: toMesh(k(big.extrude(FLOWER_T))) },
        { name: "Flor", color: "#000000", mesh: toMesh(k(k(small.extrude(TOP_T)).translate([0, 0, FLOWER_T]))) },
        { name: "Miolo", color: "#000000", mesh: toMesh(k(k(core.extrude(TOP_T)).translate([0, 0, FLOWER_T + TOP_T]))) },
      ],
    });
  }
  const total = out.reduce((a, m) => a + widthOf(m), 0) + ROW_GAP * Math.max(0, out.length - 1);
  let x = -total / 2;
  return out.map((m) => {
    const w = widthOf(m);
    const placed = shift(m, x + w / 2, 0);
    x += w + ROW_GAP;
    return placed;
  });
}
