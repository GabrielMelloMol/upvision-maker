import { loadRaster } from "../vectorize/client";
import { decodeHeif, heifFocal35, isHeif } from "./heic";
import { exifFocal35, focalPxFrom35, type Rgba } from "./photo";

/** Lado maior da foto usada na medição: ~10 px/mm numa A4 que ocupa a foto, sem pesar como 12 MP. */
const MAX_SIDE = 3000;
/** O EXIF fica no começo do JPEG; a caixa ftyp do HEIC, nos primeiros bytes. */
const EXIF_BYTES = 256 * 1024;
const MAX_BYTES = 25 * 1024 * 1024;
/** Qualidade do JPEG que só serve para mostrar a foto HEIC na tela (a medição usa os pixels decodificados). */
const PREVIEW_QUALITY = 0.92;

export type ToolPhoto = { img: Rgba; url: string; focalPx: number | null };

const scaleOf = (w: number, h: number) => Math.min(1, MAX_SIDE / Math.max(w, h));

/** Foto escolhida → pixels (já virada pela orientação), endereço para mostrar e focal em px (se o EXIF tiver). */
export async function loadToolPhoto(file: File): Promise<ToolPhoto> {
  if (file.size > MAX_BYTES) throw new Error("Foto maior que 25 MB.");
  const head = new Uint8Array(await file.slice(0, EXIF_BYTES).arrayBuffer());
  if (isHeif(head)) return loadHeif(new Uint8Array(await file.arrayBuffer()));
  const r = await loadRaster(file, scaleOf);
  const f35 = exifFocal35(head);
  return { img: { data: r.rgba, width: r.w, height: r.h }, url: r.url, focalPx: f35 ? focalPxFrom35(f35, [r.w, r.h]) : null };
}

/** HEIC: decodifica no WASM (não depende do WebView), reduz como as outras e guarda um JPEG para a tela. */
async function loadHeif(bytes: Uint8Array): Promise<ToolPhoto> {
  const [full, f35] = await Promise.all([decodeHeif(bytes), heifFocal35(bytes)]);
  const s = scaleOf(full.width, full.height);
  const w = Math.max(1, Math.round(full.width * s));
  const h = Math.max(1, Math.round(full.height * s));
  const bmp = await createImageBitmap(new ImageData(full.data, full.width, full.height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PREVIEW_QUALITY));
  if (!preview) throw new Error("Não consegui preparar a foto para mostrar na tela.");
  return { img: { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h }, url: URL.createObjectURL(preview), focalPx: f35 ? focalPxFrom35(f35, [w, h]) : null };
}
