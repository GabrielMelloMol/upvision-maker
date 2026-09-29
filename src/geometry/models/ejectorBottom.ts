import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";

export type EjectorBottom = "flat" | "round" | "dome";

const STEP_MM = 0.2; // altura de cada fatia da face curva (a impressão em 0,08–0,12 mm alisa os degraus)
const MAX_STEPS = 60;
const BISECT = 24;
const SHARP_LOSS = 0.12; // fração da área perdida numa abertura de raio r: ponta fina ou reentrância funda

/** Maior recuo (mm) que ainda deixa sobrar algo da forma: o "raio interno". */
export function inradius(cs: CS): number {
  const b = cs.bounds();
  let lo = 0, hi = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
  for (let i = 0; i < BISECT; i++) {
    const mid = (lo + hi) / 2;
    const inset = cs.offset(-mid, "Round");
    if (inset.isEmpty()) hi = mid;
    else lo = mid;
    inset.delete();
  }
  return lo;
}

/**
 * Relevo côncavo sobre a face do êmbolo (de z = 0 para cima): em cada altura z, material numa faixa de largura
 * `band(z)` junto à borda da forma. Sai em fatias finas, como a "escala gradual" da forma.
 */
function concave(M: ManifoldToplevel, plate: CS, height: number, band: (z: number) => number): Solid {
  const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(height / STEP_MM)));
  const dz = height / n;
  return scoped((k) => {
    const slices: Solid[] = [];
    for (let i = 0; i < n; i++) {
      const w = band((i + 0.5) * dz);
      if (w <= 0) continue;
      const inner = k(plate.offset(-w, "Round"));
      const ring = inner.isEmpty() ? plate : k(plate.subtract(inner));
      slices.push(k(k(ring.extrude(dz)).translate([0, 0, i * dz])));
    }
    return M.Manifold.union(slices);
  });
}

/** Borda arredondada de raio `r`: um quarto de círculo côncavo junto à parede. */
export function roundEdge(M: ManifoldToplevel, plate: CS, r: number): Solid {
  const rr = Math.min(r, inradius(plate));
  return concave(M, plate, rr, (z) => rr - Math.sqrt(Math.max(0, rr * rr - (rr - z) ** 2)));
}

/**
 * Domo: a face inteira côncava, com `height` mm de fundo no centro. `smooth` 0 = cone, 1 = elipse (borda mais
 * vertical e centro mais plano).
 */
export function dome(M: ManifoldToplevel, plate: CS, height: number, smooth: number): Solid {
  const D = inradius(plate);
  // altura da face a uma distância d da parede (x = d/D): H na parede, 0 no centro
  const s = (x: number) => height * ((1 - smooth) * (1 - x) + smooth * (1 - Math.sqrt(Math.max(0, 1 - (1 - x) ** 2))));
  return concave(M, plate, height, (z) => {
    let lo = 0, hi = 1; // s decresce em x: acha x com s(x) = z
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (s(mid) > z) lo = mid;
      else hi = mid;
    }
    return lo * D;
  });
}

/** Forma com ponta fina ou reentrância funda: o arredondado de raio `r` deforma essas regiões. */
export function hasSharpFeatures(plate: CS, r: number): boolean {
  return scoped((k) => {
    const opened = k(k(plate.offset(-r, "Round")).offset(r, "Round"));
    const closed = k(k(plate.offset(r, "Round")).offset(-r, "Round"));
    const a = plate.area();
    return (a - opened.area()) / a > SHARP_LOSS || (closed.area() - a) / a > SHARP_LOSS;
  });
}
