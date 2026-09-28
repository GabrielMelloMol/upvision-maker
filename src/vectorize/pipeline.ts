import { binarize, floodBackground, luminance, otsu, thinPixels } from "./raster";

export type TraceOptions = { threshold: number | null; invert: boolean; removeBg: boolean; widthMm: number };
export type Prepared = { mask: Uint8Array; threshold: number; fillPct: number; thin: Uint8Array | null; thinCount: number };

const MIN_STROKE_MM = 0.4; // bico padrão

/** Etapas antes do vtracer: fundo, limiar (Otsu se automático), binarização e checagem de traço fino. */
export function prepare(rgba: Uint8ClampedArray, w: number, h: number, o: TraceOptions): Prepared {
  const lum = luminance(rgba);
  const bg = o.removeBg ? floodBackground(rgba, w, h) : null;
  if (bg) for (let i = 0; i < lum.length; i++) if (bg[i]) lum[i] = o.invert ? 0 : 255;
  const threshold = o.threshold ?? otsu(bg ? lum.filter((_, i) => !bg[i]) : lum);
  const mask = binarize(lum, threshold, o.invert);
  const filled = mask.reduce((s, v) => s + v, 0);
  const mmPerPx = o.widthMm / w;
  const r = Math.round((MIN_STROKE_MM / mmPerPx - 1) / 2);
  const t = r >= 1 ? thinPixels(mask, w, h, r) : { count: 0, thin: null };
  return { mask, threshold, fillPct: (filled / mask.length) * 100, thin: t.thin, thinCount: t.count };
}
