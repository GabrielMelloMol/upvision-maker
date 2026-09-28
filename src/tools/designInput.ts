import { getManifold, type CS, type ManifoldToplevel } from "../geometry/manifold";
import { fitWidth } from "../geometry/shape2d";
import { svgToColorRegions, svgToCrossSection, type ColorRegion } from "../geometry/svgImport";
import { loadRaster, trace } from "../vectorize/client";
import { DEFAULT_TRACE } from "../vectorize/pipeline";
import { scaleFactor } from "../vectorize/raster";
import { buildSvg } from "../vectorize/svgOut";

export const DESIGN_ACCEPT = ".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif";

/** Desenho de entrada das ferramentas 3D: sempre vira SVG (imagens passam pela vetorização automática). */
export async function fileToSvg(file: File): Promise<string> {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return file.text();
  const r = await loadRaster(file, scaleFactor);
  try {
    const t = await trace(r, DEFAULT_TRACE, null).result;
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

/** Cores de preenchimento distintas escritas no SVG (fill="…" ou style="fill:…"), para a interface. */
export function svgFillColors(svg: string): string[] {
  const found = [...svg.matchAll(/fill\s*[:=]\s*"?\s*(#[0-9a-f]{3,8}|[a-z]+)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((c) => c !== "none" && c !== "transparent"))];
}

const SIMPLIFY_MM = 0.02;

/**
 * SVG → região 2D em mm, Y para cima, centrada; opcionalmente espelhada. Quem chama deve dar delete() em `cs` e nas `layers`.
 * Com `colors`, `layers` traz uma região por cor quando o SVG tem 2+ cores (encaixadas, sem sobreposição); senão null.
 */
export async function designFromSvg(
  svg: string,
  widthMm: number,
  mirror: boolean,
  colors = false,
): Promise<{ M: ManifoldToplevel; cs: CS; layers: ColorRegion[] | null }> {
  const M = await getManifold();
  if (!colors) return { M, cs: toMm(svgToCrossSection(M, svg), widthMm, mirror), layers: null };
  const regions = svgToColorRegions(M, svg);
  if (regions.length < 2) {
    regions.forEach((r) => r.cs.delete());
    return { M, cs: toMm(svgToCrossSection(M, svg), widthMm, mirror), layers: null };
  }
  const all = M.CrossSection.union(regions.map((r) => r.cs));
  const ref = all.bounds();
  const layers = regions.map((r) => ({ color: r.color, cs: toMm(r.cs, widthMm, mirror, ref) }));
  return { M, cs: toMm(all, widthMm, mirror, ref), layers };
}

/** Encaixa na largura e simplifica; apaga `raw`. */
function toMm(raw: CS, widthMm: number, mirror: boolean, ref?: ReturnType<CS["bounds"]>): CS {
  try {
    const fitted = fitWidth(raw, widthMm, mirror, ref);
    const cs = fitted.simplify(SIMPLIFY_MM);
    fitted.delete();
    return cs;
  } finally {
    raw.delete();
  }
}
