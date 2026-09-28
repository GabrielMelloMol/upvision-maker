import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { CS, ManifoldToplevel } from "./manifold";
import type { Contour } from "./svgPath";

const CURVE_DIVISIONS = 24;
const MAX_BYTES = 5 * 1024 * 1024;

const close = (a: Contour[number], b: Contour[number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** Faixa do traço: anel para contorno fechado; cápsulas (segmentos + juntas redondas) para linha aberta. */
function strokeOf(M: ManifoldToplevel, pts: Contour, closed: boolean, width: number): CS {
  const r = width / 2;
  if (closed) {
    const base = new M.CrossSection([pts], "NonZero");
    const outer = base.offset(r, "Round");
    const inner = base.offset(-r, "Round");
    const ring = outer.subtract(inner);
    [base, outer, inner].forEach((o) => o.delete());
    return ring;
  }
  const pieces: Contour[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const nx = (-(b[1] - a[1]) / len) * r;
    const ny = ((b[0] - a[0]) / len) * r;
    pieces.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  const joints = pts.map((p) => M.CrossSection.circle(r, 16).translate(p));
  const all = M.CrossSection.union([...joints, new M.CrossSection(pieces, "NonZero")]);
  joints.forEach((j) => j.delete());
  return all;
}

/**
 * SVG qualquer (caminhos, formas, grupos com transform, preenchimento e/ou traço) → uma região 2D (união de tudo).
 * Coordenadas continuam em unidades do SVG (Y para baixo); use fitWidth para ir a mm.
 */
export function svgToCrossSection(M: ManifoldToplevel, svg: string): CS {
  if (svg.length > MAX_BYTES) throw new Error("SVG maior que 5 MB.");
  if (/<!ENTITY/i.test(svg)) throw new Error("SVG com declarações ENTITY não é aceito.");
  const data = new SVGLoader().parse(svg);
  const pieces: CS[] = [];
  for (const path of data.paths) {
    const style = (path.userData?.style ?? {}) as Record<string, string | number | undefined>;
    const contours = path.subPaths.map((sp) => {
      const pts = sp.getPoints(CURVE_DIVISIONS).map((v) => [v.x, v.y] as Contour[number]);
      const closed = sp.autoClose || (pts.length > 2 && close(pts[0], pts[pts.length - 1]));
      if (pts.length > 1 && close(pts[0], pts[pts.length - 1])) pts.pop();
      return { pts, closed };
    });
    const filled = style.fill !== "none" && style.fill !== "transparent" && style.fillOpacity !== 0;
    if (filled) {
      const polys = contours.map((c) => c.pts).filter((p) => p.length >= 3);
      if (polys.length) pieces.push(new M.CrossSection(polys, style.fillRule === "evenodd" ? "EvenOdd" : "NonZero"));
    }
    const sw = Number(style.strokeWidth ?? 0);
    // ponytail: largura do traço não acompanha scale() do transform; bom para SVGs de ilustrador comuns
    if (style.stroke && style.stroke !== "none" && sw > 0) {
      for (const c of contours) if (c.pts.length >= 2) pieces.push(strokeOf(M, c.pts, c.closed, sw));
    }
  }
  const all = M.CrossSection.union(pieces);
  pieces.forEach((p) => p.delete());
  if (all.isEmpty()) {
    all.delete();
    throw new Error("Nenhuma forma encontrada no SVG.");
  }
  return all;
}
