import type { CS, ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";

export type CaseShapeId = "round" | "heart" | "drop" | "hex";

const SEGMENTS = 96;
const KNURL_PITCH = 2.4; // mm entre estrias
const KNURL_R = 0.7; // raio da estria (a metade de fora é o relevo)
const FIT_STEPS = 24;
const FIT_BISECT = 9;
const FIT_MAX_R = 80;
const FIT_EPS = 0.05; // mm² que podem sobrar para fora na checagem do círculo inscrito

/** Coração gordinho de referência (dois lóbulos grandes ligados a uma ponta), sem escala: assim o círculo da rosca ocupa boa parte dele. */
function heart0(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D): CS {
  const r = 25;
  const tip = k(M.CrossSection.circle(1.5, 16).translate([0, -r * 1.55]));
  const half = (x: number) => k(M.CrossSection.hull([k(M.CrossSection.circle(r, 64).translate([x, r * 0.25])), tip]));
  return M.CrossSection.union([half(-r * 0.62), half(r * 0.62)]);
}

/** Maior círculo (centro no eixo X = 0) que cabe em `shape`: [centro y, raio]. */
function incircle(M: ManifoldToplevel, shape: CS, k: <D extends { delete(): void }>(o: D) => D): [number, number] {
  const b = shape.bounds();
  let best: [number, number] = [0, 0];
  for (let i = 0; i <= FIT_STEPS; i++) {
    const y = b.min[1] + ((b.max[1] - b.min[1]) * i) / FIT_STEPS;
    let lo = 0, hi = FIT_MAX_R;
    for (let j = 0; j < FIT_BISECT; j++) {
      const mid = (lo + hi) / 2;
      const out = k(k(M.CrossSection.circle(mid, 48).translate([0, y])).subtract(shape));
      if (out.area() < FIT_EPS) lo = mid;
      else hi = mid;
    }
    if (lo > best[1]) best = [y, lo];
  }
  return best;
}

/** Contorno de `shape` com um círculo de raio `needR` inscrito, centrado no eixo da rosca (origem). */
function shapeOutline(M: ManifoldToplevel, shape: CaseShapeId, needR: number, k: <D extends { delete(): void }>(o: D) => D): CS {
  switch (shape) {
    case "hex":
      return M.CrossSection.circle(needR / Math.cos(Math.PI / 6), 6); // apótema = needR
    case "drop":
      return M.CrossSection.hull([k(M.CrossSection.circle(needR, SEGMENTS)), k(M.CrossSection.circle(needR * 0.12, 24).translate([0, needR * 2.25]))]);
    case "heart": {
      const h = k(heart0(M, k));
      const [y, r] = incircle(M, h, k);
      const moved = k(h.translate([0, -y]));
      return moved.scale([needR / r, needR / r]);
    }
    default:
      return M.CrossSection.circle(needR, SEGMENTS);
  }
}

/** Estrias (recartilhado) na borda: bolinhas centradas no contorno, de ponta a ponta. */
function knurled(M: ManifoldToplevel, outline: CS, k: <D extends { delete(): void }>(o: D) => D): CS {
  const poly = outline.toPolygons().reduce((a, b) => (b.length > a.length ? b : a));
  const dots: CS[] = [];
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = carry; d < len; d += KNURL_PITCH) {
      const t = d / len;
      dots.push(k(M.CrossSection.circle(KNURL_R, 12).translate([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])));
      carry = d + KNURL_PITCH - len;
    }
    if (carry < 0) carry = 0;
  }
  return M.CrossSection.union([outline, ...dots]);
}

/** Contornos do corpo e da tampa: o formato escolhido, e na tampa as estrias se pedidas. Quem chama dá delete() nos dois. */
export function caseOutlines(M: ManifoldToplevel, shape: CaseShapeId, needR: number, knurl: boolean): { outline: CS; lidOutline: CS } {
  return scoped((k) => {
    const outline = k(shapeOutline(M, shape, needR, k));
    const lid = knurl ? k(knurled(M, outline, k)) : outline;
    return { outline: outline.translate([0, 0]), lidOutline: lid.translate([0, 0]) };
  });
}
