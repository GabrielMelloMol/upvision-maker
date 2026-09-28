import { boxBlur, closeMask, fillHoles, largestComponent, removeSmall, smoothMask, thicken } from "./cleanup";
import { binarize, floodBackground, luminance, openMask, otsu, thinPixels } from "./raster";

export type TraceMode = "logo" | "silhouette";

export type TraceOptions = {
  mode: TraceMode;
  threshold: number | null; // null = automático (Otsu)
  invert: boolean;
  removeBg: boolean;
  widthMm: number;
  cleanup: number; // 0–3: desfoque + abrir/fechar
  minAreaMm2: number; // pedaços e furos menores somem
  detail: number; // 1–10: fidelidade das curvas
  thicken: boolean; // engrossa traços finos
  smoothMm: number; // silhueta: suavização do contorno
};

export const DEFAULT_TRACE: TraceOptions = {
  mode: "logo",
  threshold: null,
  invert: false,
  removeBg: true,
  widthMm: 80,
  cleanup: 1,
  minAreaMm2: 1,
  detail: 6,
  thicken: false,
  smoothMm: 1,
};

export type Prepared = { mask: Uint8Array; threshold: number; fillPct: number; thin: Uint8Array | null; thinCount: number };

const MIN_STROKE_MM = 0.4; // bico padrão
const MORPH_MM_PER_LEVEL = 0.1;

/** Máscara da forma (1 = imprimir) antes do vtracer. `seg` = máscara do objeto principal (modo silhueta). */
export function prepare(rgba: Uint8ClampedArray, w: number, h: number, o: TraceOptions, seg?: Uint8Array | null): Prepared {
  const pxPerMm = w / o.widthMm;
  let mask: Uint8Array;
  let threshold = o.threshold ?? 128;

  if (o.mode === "silhouette") {
    let base = seg ?? null;
    if (!base) {
      const bg = floodBackground(rgba, w, h);
      if (bg) base = Uint8Array.from(bg, (v) => 1 - v);
      else {
        const lum = luminance(rgba);
        threshold = o.threshold ?? otsu(lum);
        base = binarize(lum, threshold, o.invert);
      }
    }
    mask = fillHoles(largestComponent(base, w, h), w, h);
    mask = smoothMask(mask, w, h, Math.round(o.smoothMm * pxPerMm));
    mask = fillHoles(largestComponent(mask, w, h), w, h);
  } else {
    let lum = luminance(rgba);
    const bg = o.removeBg ? floodBackground(rgba, w, h) : null;
    if (bg) for (let i = 0; i < lum.length; i++) if (bg[i]) lum[i] = o.invert ? 0 : 255;
    lum = boxBlur(lum, w, h, Math.round(o.cleanup));
    threshold = o.threshold ?? otsu(bg ? lum.filter((_, i) => !bg[i]) : lum);
    mask = binarize(lum, threshold, o.invert);
    const r = Math.round(o.cleanup * MORPH_MM_PER_LEVEL * pxPerMm);
    if (r > 0) mask = closeMask(openMask(mask, w, h, r), w, h, r);
  }

  mask = removeSmall(mask, w, h, o.minAreaMm2 * pxPerMm * pxPerMm);
  const thinR = Math.round((MIN_STROKE_MM * pxPerMm - 1) / 2);
  let t = thinR >= 1 ? thinPixels(mask, w, h, thinR) : { count: 0, thin: null as Uint8Array | null };
  if (o.thicken && t.thin && t.count) {
    mask = thicken(mask, t.thin, w, h, thinR);
    t = thinPixels(mask, w, h, thinR);
  }
  const filled = mask.reduce((s, v) => s + v, 0);
  return { mask, threshold, fillPct: (filled / mask.length) * 100, thin: t.count ? t.thin : null, thinCount: t.count };
}
