import type { CS, ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";

export type RimStyle = "none" | "simple" | "double" | "serrated" | "dotted" | "laurel";
export type Texture = "none" | "sunburst" | "dots" | "stripes";

type K = <D extends { delete(): void }>(o: D) => D;
type Pt = [number, number];

/** Pontos a cada `step` mm ao longo do maior contorno de `cs`, com o ângulo da tangente (radianos). */
export function samplePath(cs: CS, step: number): { p: Pt; angle: number }[] {
  const polys = cs.toPolygons();
  if (!polys.length) return [];
  const area = (poly: Pt[]) => Math.abs(poly.reduce((s, [x1, y1], i) => s + x1 * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y1, 0));
  const ring = polys.reduce((a, b) => (area(b as Pt[]) > area(a as Pt[]) ? b : a)) as Pt[];
  const out: { p: Pt; angle: number }[] = [];
  let carry = 0;
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let d = carry; d < len; d += step) out.push({ p: [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len], angle });
    carry = (((carry - len) % step) + step) % step;
  }
  return out;
}

const ring = (k: K, outline: CS, from: number, to: number) => k(k(outline.offset(-from, "Round")).subtract(k(outline.offset(-to, "Round"))));

/** Folha de louro: elipse fina girada, com a base em (0, 0) apontando para +x. */
function leaf(M: ManifoldToplevel, k: K, len: number): CS {
  return k(k(k(M.CrossSection.circle(0.5, 24)).scale([len, len * 0.36])).translate([len / 2, 0]));
}

/**
 * Borda da medalha na largura `w` (a partir do contorno para dentro). Louros: dois ramos de folhas subindo pelos
 * lados, por dentro de uma borda fina. Serrilhada: bordinha com recortes redondos no lado de fora.
 */
export function medalRim(M: ManifoldToplevel, outline: CS, w: number, style: RimStyle): CS | null {
  if (style === "none" || w <= 0) return null;
  return scoped((k) => {
    if (style === "simple") return ring(k, outline, 0, w).translate([0, 0]);
    if (style === "double") return M.CrossSection.union([ring(k, outline, 0, w * 0.4), ring(k, outline, w * 0.65, w)]);
    if (style === "serrated") {
      const notch = w * 0.45;
      const cuts = samplePath(outline, notch * 2.6).map(({ p }) => k(k(M.CrossSection.circle(notch, 16)).translate(p)));
      return ring(k, outline, 0, w).subtract(k(M.CrossSection.union(cuts)));
    }
    if (style === "dotted") {
      const mid = k(outline.offset(-w / 2, "Round"));
      const r = w * 0.32;
      const dots = samplePath(mid, r * 3.2).map(({ p }) => k(k(M.CrossSection.circle(r, 16)).translate(p)));
      return M.CrossSection.union([ring(k, outline, 0, w * 0.25), ...dots]);
    }
    // louros: folhas em pares, dos dois lados, só na metade de baixo e nas laterais (o topo fica para o texto/alça)
    const thin = ring(k, outline, 0, Math.max(0.8, w * 0.3));
    const path = k(outline.offset(-w * 0.9, "Round"));
    const b = outline.bounds();
    const cy = (b.min[1] + b.max[1]) / 2, h = b.max[1] - b.min[1];
    const len = w * 2.1;
    const leaves = samplePath(path, len * 0.75)
      .filter(({ p }) => p[1] < cy + h * 0.28)
      .flatMap(({ p, angle }) => [angle + 0.75, angle - 0.75].map((a) => k(k(leaf(M, k, len).rotate((a * 180) / Math.PI)).translate(p))));
    return k(M.CrossSection.union([thin, ...leaves])).intersect(outline);
  });
}

/** Textura de fundo dentro de `inner` (vai em relevo baixo, em outra cor). */
export function medalTexture(M: ManifoldToplevel, inner: CS, t: Texture): CS | null {
  if (t === "none") return null;
  return scoped((k) => {
    const b = inner.bounds();
    const R = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    const c: Pt = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    let pattern: CS;
    if (t === "sunburst") {
      const n = 24;
      const rays = Array.from({ length: n }, (_, i) => {
        const a0 = (i * 2 * Math.PI) / n, a1 = a0 + Math.PI / n;
        return k(new M.CrossSection([[c, [c[0] + R * Math.cos(a0), c[1] + R * Math.sin(a0)], [c[0] + R * Math.cos(a1), c[1] + R * Math.sin(a1)]]], "NonZero"));
      });
      pattern = k(M.CrossSection.union(rays));
    } else if (t === "dots") {
      const step = 3;
      const dots: CS[] = [];
      for (let x = b.min[0]; x <= b.max[0]; x += step) for (let y = b.min[1]; y <= b.max[1]; y += step) dots.push(k(k(M.CrossSection.circle(0.6, 12)).translate([x + ((Math.round((y - b.min[1]) / step) % 2) * step) / 2, y])));
      pattern = k(M.CrossSection.union(dots));
    } else {
      const step = 3;
      const stripes: CS[] = [];
      for (let x = -R; x <= R; x += step) stripes.push(k(k(k(M.CrossSection.square([1.4, 2 * R], true)).rotate(45)).translate([c[0] + x, c[1]])));
      pattern = k(M.CrossSection.union(stripes));
    }
    return pattern.intersect(inner);
  });
}
