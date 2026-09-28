import { quantize, stackedMasks } from "./palette";
import type { TraceOptions } from "./pipeline";
import type { ColorLayer } from "./svgOut";
import { vectorizeMask } from "./vtrace";

const MIN_ISLAND_PX = 4;

/** Modo colorido: paleta → máscaras empilhadas → uma camada vetorizada por cor (a 1ª é a silhueta inteira). */
export async function traceColors(rgba: Uint8ClampedArray, w: number, h: number, o: TraceOptions, onTick?: (n: number) => void) {
  const pxPerMm = w / o.widthMm;
  const minAreaPx = Math.max(MIN_ISLAND_PX, o.minAreaMm2 * pxPerMm * pxPerMm);
  const q = quantize(rgba, w, h, { colors: o.colors, removeBg: o.removeBg, minAreaPx, filaments: o.palette ?? undefined });
  const masks = stackedMasks(q.labels, q.palette.length);
  const layers: ColorLayer[] = [];
  let done = 0;
  for (let i = 0; i < masks.length; i++) {
    const d = await vectorizeMask(masks[i], w, h, o.detail, (t) => onTick?.(done + t));
    done += (d.match(/M/g) ?? []).length;
    layers.push({ color: q.palette[i], d });
  }
  const filled = masks[0]?.reduce((s, v) => s + v, 0) ?? 0;
  return { layers, fillPct: (filled / (w * h)) * 100 };
}
