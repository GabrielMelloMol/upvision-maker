import type { TraceOptions } from "./pipeline";
import type { TraceRequest, TraceResponse } from "./vectorize.worker";

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 120_000;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/bmp,image/gif,image/avif";

export type Raster = { rgba: Uint8ClampedArray; w: number; h: number; url: string };

/** Decodifica (respeitando EXIF) e reamostra com suavização alta. */
export async function loadRaster(file: Blob, scale: (w: number, h: number) => number): Promise<Raster> {
  if (file.size > MAX_BYTES) throw new Error("Imagem maior que 25 MB.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não consegui abrir esta imagem. Use PNG, JPG, WebP, BMP, GIF ou AVIF.");
  }
  const s = scale(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { rgba: ctx.getImageData(0, 0, w, h).data, w, h, url: URL.createObjectURL(file) };
}

let worker: Worker | null = null;
let seq = 0;

/** Vetoriza no worker. Pedidos antigos são descartados quando chega um novo (o chamador ignora ids velhos). */
export function trace(r: Raster, options: TraceOptions): Promise<Extract<TraceResponse, { ok: true }>> {
  worker ??= new Worker(new URL("./vectorize.worker.ts", import.meta.url), { type: "module" });
  const id = ++seq;
  const w = worker;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      w.terminate();
      worker = null;
      reject(new Error("A vetorização demorou demais. Tente uma imagem menor."));
    }, TIMEOUT_MS);
    const onMsg = (e: MessageEvent<TraceResponse>) => {
      if (e.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.error));
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", (ev) => reject(new Error(ev.message || "Falha no motor de vetorização.")), { once: true });
    const msg: TraceRequest = { id, rgba: r.rgba.slice(), w: r.w, h: r.h, options };
    w.postMessage(msg);
  });
}
export const latestTraceId = () => seq;
