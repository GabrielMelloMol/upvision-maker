import type { Contour } from "./svgPath";
import type { CS, ManifoldToplevel } from "./manifold";

type Deletable = { delete(): void };

/**
 * Objetos do manifold vivem na memória do WASM e precisam de delete().
 * `scoped` entrega `k()` para registrar temporários e apaga todos ao final.
 */
export function scoped<T>(fn: (k: <D extends Deletable>(o: D) => D) => T): T {
  const trash: Deletable[] = [];
  try {
    return fn((o) => (trash.push(o), o));
  } finally {
    for (const o of trash) o.delete();
  }
}

export type FillRule = "EvenOdd" | "NonZero";

export const csFromContours = (M: ManifoldToplevel, contours: Contour[], fill: FillRule): CS => new M.CrossSection(contours, fill);

/** Área assinada (positiva = anti-horário = contorno externo no Clipper). */
function signedArea(poly: Contour): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Só a silhueta: remove os furos. */
export function outerOnly(M: ManifoldToplevel, cs: CS): CS {
  return new M.CrossSection(cs.toPolygons().filter((p) => signedArea(p) > 0), "NonZero");
}

/** Converte coordenadas de SVG (px, Y para baixo) em mm (Y para cima), com a largura pedida, centralizado na origem. */
export function fitWidth(cs: CS, widthMm: number, mirrorX = false): CS {
  const b = cs.bounds();
  const w = b.max[0] - b.min[0];
  if (!(w > 0)) throw new Error("O desenho está vazio.");
  const s = widthMm / w;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  return cs.translate([-cx, -cy]).scale([mirrorX ? -s : s, -s]);
}
