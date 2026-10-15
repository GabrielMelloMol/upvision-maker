import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { EXTRA_DEPTH, pinCs, WALL, type K, type PinShape } from "./planeCut";

/**
 * Encaixe inteligente do corte parcial: o tamanho vem do maior círculo que cabe na face cortada, a posição é o centro
 * desse círculo (mais pinos se a face é comprida) e a profundidade é a maior em que o furo fica inteiro dentro das
 * duas peças, sem furar a parede de fora.
 */
type Pt = [number, number];

const MIN_SIZE = 3;
const MAX_SIZE = 12;
const FILL = 0.8; // o pino ocupa 80% do círculo livre (depois da parede)
const LONG_RATIO = 2.5;
const MAX_PINS = 4;
const SMALL_ISLAND = 0.05; // ilhas com menos de 5% da maior não recebem pino
const MIN_DEPTH = 1.5;
const DEPTH_STEP = 0.75;
const OUTSIDE_MM3 = 0.5; // volume do furo que pode ficar fora da peça (ruído numérico)
const SEARCH_STEPS = 14;

/** Maior círculo inscrito de uma ilha da face: raio e centro. */
export function inscribed(k: K, island: CS): { r: number; p: Pt } {
  const b = island.bounds();
  let lo = 0;
  let hi = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (k(island.offset(-mid, "Round")).isEmpty()) hi = mid;
    else lo = mid;
  }
  const core = k(island.offset(-lo, "Round"));
  const cb = core.isEmpty() ? b : core.bounds();
  return { r: lo, p: [(cb.min[0] + cb.max[0]) / 2, (cb.min[1] + cb.max[1]) / 2] };
}

export type PinPlan = { size: number; spots: Pt[]; warning: string | null };

/** Tamanho (se `size0` = 0) e pontos dos pinos na face `section`. */
export function planPins(M: ManifoldToplevel, k: K, section: CS, size0: number): PinPlan {
  const islands = section.decompose().map(k);
  const infos = islands.map((island) => ({ island, area: island.area(), ...inscribed(k, island) }));
  const big = Math.max(0, ...infos.map((i) => i.area));
  const eligible = infos.filter((i) => i.area >= big * SMALL_ISLAND);
  const fit = Math.min(...eligible.map((i) => 2 * (i.r - WALL) * FILL));
  const size = size0 > 0 ? size0 : Math.min(MAX_SIZE, fit);
  const tooSmall = !eligible.length || size < (size0 > 0 ? 1 : MIN_SIZE);
  if (tooSmall) return { size: Math.max(size, 0), spots: [], warning: "face pequena" };
  const spots: Pt[] = [];
  for (const { island, p } of eligible) {
    const safe = k(island.offset(-(size / 2 + WALL), "Round"));
    if (safe.isEmpty()) continue;
    const b = safe.bounds();
    const [w, h] = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    const ratio = Math.max(w, h) / Math.max(Math.min(w, h), 0.01);
    const n = ratio > LONG_RATIO ? Math.min(MAX_PINS, Math.ceil(ratio / 1.8)) : 1;
    const alongX = w >= h;
    const cands: Pt[] = n === 1 ? [p] : Array.from({ length: n }, (_, i): Pt => {
      const t = (i + 0.5) / n;
      return alongX ? [b.min[0] + w * t, (b.min[1] + b.max[1]) / 2] : [(b.min[0] + b.max[0]) / 2, b.min[1] + h * t];
    });
    for (const c of cands) {
      const probe = k(k(M.CrossSection.circle(0.01, 8)).translate(c));
      if (!k(probe.intersect(safe)).isEmpty()) spots.push(c);
      else spots.push(safe.toPolygons().flat().reduce((a, q) => (Math.hypot(q[0] - c[0], q[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? q : a)) as Pt);
    }
  }
  return { size, spots, warning: spots.length ? null : "face pequena" };
}

/**
 * Profundidade em que cada furo (com folga) cabe inteiro nas duas peças; pontos que não chegam a 1,5 mm saem.
 * `above` é a peça de cima (z ≥ 0) e `below` o resto (z ≤ 0), no referencial do corte.
 */
export function fitDepth(M: ManifoldToplevel, k: K, o: { shape: PinShape; size: number; clearance: number; want: number }, spots: Pt[], above: Solid, below: Solid): { spots: Pt[]; depth: number } {
  const hole = (p: Pt) => k(k(k(pinCs(M, o.shape, o.size)).offset(o.clearance, "Miter")).translate(p));
  const outside = (cs: CS, d: number, up: boolean, within: Solid) => {
    const col = k(k(cs.extrude(d + EXTRA_DEPTH)).translate([0, 0, up ? 0 : -d - EXTRA_DEPTH]));
    return k(col.subtract(within)).volume() > OUTSIDE_MM3;
  };
  const kept: { p: Pt; d: number }[] = [];
  for (const p of spots) {
    const cs = hole(p);
    let d = o.want;
    while (d >= MIN_DEPTH && (outside(cs, d, true, above) || outside(cs, d, false, below))) d -= DEPTH_STEP;
    if (d >= MIN_DEPTH) kept.push({ p, d });
  }
  return { spots: kept.map((x) => x.p), depth: kept.length ? Math.min(...kept.map((x) => x.d)) : 0 };
}
