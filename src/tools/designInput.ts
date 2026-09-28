import { getManifold, type CS, type ManifoldToplevel } from "../geometry/manifold";
import { fitWidth } from "../geometry/shape2d";
import { svgToCrossSection } from "../geometry/svgImport";
import { loadRaster, trace } from "../vectorize/client";
import { scaleFactor } from "../vectorize/raster";
import { buildSvg } from "../vectorize/svgOut";

export const DESIGN_ACCEPT = ".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif";

/** Desenho de entrada das ferramentas 3D: sempre vira SVG (imagens passam pela vetorização automática). */
export async function fileToSvg(file: File): Promise<string> {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return file.text();
  const r = await loadRaster(file, scaleFactor);
  try {
    const t = await trace(r, { threshold: null, invert: false, removeBg: true, widthMm: 80 });
    return buildSvg(t.d, r.w, r.h, 80);
  } finally {
    URL.revokeObjectURL(r.url);
  }
}

/** Largura em mm declarada no SVG (ex.: width="80mm"), para sugerir o tamanho. */
export function svgWidthMm(svg: string): number | null {
  const m = /<svg\b[^>]*\bwidth="([\d.]+)mm"/i.exec(svg);
  return m ? Number(m[1]) : null;
}

const SIMPLIFY_MM = 0.02;

/** SVG → região 2D em mm, Y para cima, centrada; opcionalmente espelhada. Quem chama deve dar delete(). */
export async function designFromSvg(svg: string, widthMm: number, mirror: boolean): Promise<{ M: ManifoldToplevel; cs: CS }> {
  const M = await getManifold();
  const raw = svgToCrossSection(M, svg);
  try {
    const fitted = fitWidth(raw, widthMm, mirror);
    const cs = fitted.simplify(SIMPLIFY_MM);
    fitted.delete();
    return { M, cs };
  } finally {
    raw.delete();
  }
}
