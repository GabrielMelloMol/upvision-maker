import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";

export type EjectorBottom = "flat" | "round" | "dome" | "scale";

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
 * Relevo côncavo sobre a face do êmbolo (de z = 0 para cima): em cada altura z, material na forma menos o miolo
 * `inner(z)` (null = sem miolo). Sai em fatias finas, como a "escala gradual" da forma.
 */
function concave(M: ManifoldToplevel, plate: CS, height: number, inner: (z: number) => CS | null): Solid {
  const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(height / STEP_MM)));
  const dz = height / n;
  return scoped((k) => {
    const slices: Solid[] = [];
    let below = plate;
    for (let i = 0; i < n; i++) {
      const hole = inner((i + 0.5) * dz);
      // cada fatia fica dentro da de baixo: nada no ar, mesmo quando o miolo encolhido sai da forma (desenho côncavo)
      const ring = hole ? k(k(plate.subtract(k(hole))).intersect(below)) : below;
      if (ring.isEmpty()) break;
      slices.push(k(k(ring.extrude(dz + (i < n - 1 ? 0.001 : 0))).translate([0, 0, i * dz]))); // sobrepõe: só encostar não une
      below = ring;
    }
    return M.Manifold.union(slices);
  });
}

/** Faixa de largura `w` junto à borda: o miolo é a forma recuada de `w`. */
const band = (plate: CS, w: (z: number) => number) => (z: number) => (w(z) <= 0 ? plate.offset(0, "Round") : plate.offset(-w(z), "Round"));

/** Borda arredondada de raio `r`: um quarto de círculo côncavo junto à parede. */
export function roundEdge(M: ManifoldToplevel, plate: CS, r: number): Solid {
  const rr = Math.min(r, inradius(plate));
  return concave(M, plate, rr, band(plate, (z) => rr - Math.sqrt(Math.max(0, rr * rr - (rr - z) ** 2))));
}

/**
 * Domo: a face inteira côncava, com `height` mm de fundo no centro. `smooth` 0 = cone, 1 = elipse (borda mais
 * vertical e centro mais plano).
 */
export function dome(M: ManifoldToplevel, plate: CS, height: number, smooth: number): Solid {
  const D = inradius(plate);
  const x = profile(height, smooth);
  return concave(M, plate, height, band(plate, (z) => x(z) * D));
}

/** Perfil do domo: a fração x do caminho da parede ao centro em que a face tem altura z (H na parede, 0 no centro). */
function profile(height: number, smooth: number): (z: number) => number {
  const s = (x: number) => height * ((1 - smooth) * (1 - x) + smooth * (1 - Math.sqrt(Math.max(0, 1 - (1 - x) ** 2))));
  return (z) => {
    let lo = 0, hi = 1; // s decresce em x: acha x com s(x) = z
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (s(mid) > z) lo = mid;
      else hi = mid;
    }
    return lo;
  };
}

/**
 * Domo por escala (#252, o "scale dome" da Mafagrafos): em vez de recuar a borda, a forma inteira encolhe até um ponto
 * no centro, camada por camada, com o mesmo perfil do domo. Mantém as quinas da forma; só fica bom em forma simples e
 * redonda (ponta ou reentrância saem tortas).
 */
export function scaleDome(M: ManifoldToplevel, plate: CS, height: number, smooth: number): Solid {
  const b = plate.bounds();
  const c: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
  const x = profile(height, smooth);
  return scoped((k) =>
    concave(M, plate, height, (z) => {
      const r = 1 - x(z);
      return r <= 1e-3 ? null : k(k(plate.translate([-c[0], -c[1]])).scale([r, r])).translate(c);
    }),
  );
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
