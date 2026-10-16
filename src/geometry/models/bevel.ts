import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";

export type Edge = "none" | "chamfer" | "round";

const STEP = 0.2; // mm de altura de cada degrau do chanfro: a mesma ordem da camada de impressão

/** Quanto o contorno recua (mm) a z mm do começo da aresta de raio/chanfro `c`. */
function inset(edge: Edge, c: number, z: number): number {
  if (edge === "chamfer") return c - z;
  return c - Math.sqrt(Math.max(0, c * c - (c - z) * (c - z)));
}

/**
 * Prisma do contorno `outline` com altura `h`, com a aresta de baixo e/ou a de cima chanfrada ou arredondada (`c` mm).
 * O perfil sai em degraus de 0,2 mm (a altura de uma camada), então o fatiador vê a curva inteira. Quem chama dá delete().
 */
export function bevelPrism(M: ManifoldToplevel, outline: CS, h: number, edge: Edge, c: number, ends: { bottom?: boolean; top?: boolean }): Solid {
  return scoped((k) => {
    const cc = edge === "none" ? 0 : Math.min(c, h / 2 - 0.01);
    if (cc <= 0) return outline.extrude(h);
    const n = Math.max(1, Math.round(cc / STEP));
    const slab = (z0: number, z1: number, inner: number) => {
      const src = inner ? k(outline.offset(-inner, "Round")) : outline;
      return k(src.extrude(z1 - z0)).translate([0, 0, z0]);
    };
    const pieces: Solid[] = [];
    const lo = ends.bottom ? cc : 0, hi = ends.top ? cc : 0;
    pieces.push(k(slab(lo, h - hi, 0)));
    for (let i = 0; i < n; i++) {
      const z0 = (i * cc) / n, z1 = ((i + 1) * cc) / n;
      const ins = inset(edge, cc, (z0 + z1) / 2);
      if (ends.bottom) pieces.push(k(slab(z0, z1, ins)));
      if (ends.top) pieces.push(k(slab(h - z1, h - z0, ins)));
    }
    return M.Manifold.union(pieces);
  });
}
