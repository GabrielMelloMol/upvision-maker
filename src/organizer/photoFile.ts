import { loadRaster } from "../vectorize/client";
import { exifFocal35, focalPxFrom35, type Rgba } from "./photo";

/** Lado maior da foto usada na medição: ~10 px/mm numa A4 que ocupa a foto, sem pesar como 12 MP. */
const MAX_SIDE = 3000;
/** O EXIF fica no começo do JPEG. */
const EXIF_BYTES = 256 * 1024;

export type ToolPhoto = { img: Rgba; url: string; focalPx: number | null };

/** Foto escolhida → pixels (já virada pela orientação do EXIF), endereço para mostrar e focal em px (se o EXIF tiver). */
export async function loadToolPhoto(file: File): Promise<ToolPhoto> {
  const r = await loadRaster(file, (w, h) => Math.min(1, MAX_SIDE / Math.max(w, h)));
  const head = new Uint8Array(await file.slice(0, EXIF_BYTES).arrayBuffer());
  const f35 = exifFocal35(head);
  return { img: { data: r.rgba, width: r.w, height: r.h }, url: r.url, focalPx: f35 ? focalPxFrom35(f35, [r.w, r.h]) : null };
}
