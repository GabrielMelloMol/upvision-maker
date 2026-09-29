import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";

export type Ornament = "heart" | "star" | "paw";

const SEG = 64;

/** Coração de altura `h`, centrado na origem (curva paramétrica clássica). */
export function heart(M: ManifoldToplevel, h: number): CS {
  const pts: [number, number][] = Array.from({ length: SEG }, (_, i) => {
    const t = (i / SEG) * 2 * Math.PI;
    return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
  });
  const s = h / 29; // a curva vai de y ≈ −17 a 12
  return new M.CrossSection([pts.map(([x, y]) => [x * s, (y + 2.5) * s] as [number, number])], "NonZero");
}

/** Estrela de 5 pontas com diâmetro `d`, centrada. */
export function star(M: ManifoldToplevel, d: number): CS {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? d * 0.2 : d / 2;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    return [r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
  return new M.CrossSection([pts], "NonZero");
}

/** Patinha de altura `h`: almofada oval e 4 dedos, centrada. */
export function paw(M: ManifoldToplevel, h: number): CS {
  const u = h / 10;
  return scoped((k) => {
    const oval = (r: number, sx: number, sy: number, x: number, y: number) => k(k(k(M.CrossSection.circle(r * u, 48)).scale([sx, sy])).translate([x * u, y * u]));
    const toes = ([[-3.4, 1.2], [-1.2, 3.2], [1.2, 3.2], [3.4, 1.2]] as const).map(([x, y]) => oval(1.25, 1, 1.25, x, y));
    const all = k(M.CrossSection.union([oval(2.6, 1.25, 1, 0, -2.3), ...toes]));
    const b = all.bounds();
    return all.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  });
}

export const ornament = (M: ManifoldToplevel, kind: Ornament, size: number): CS => (kind === "heart" ? heart(M, size) : kind === "paw" ? paw(M, size) : star(M, size));
