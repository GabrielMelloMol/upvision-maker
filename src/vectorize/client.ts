import { onReleaseHeavy } from "../ui/heavy";
import { nozzleMm } from "../geometry/bed";
import type { TraceOptions } from "./pipeline";
import type { TraceDone, TraceMessage, TraceRequest } from "./vectorize.worker";

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

export class TraceCancelled extends Error {
  constructor() {
    super("Processamento cancelado.");
  }
}

export type TraceProgress = { stage: "prepare" | "trace"; ticks: number };
export type TraceJob = { result: Promise<TraceDone>; cancel: () => void };

/** Vetoriza no worker. `cancel()` encerra o worker na hora (um novo é criado no próximo pedido). */
export function trace(r: Raster, wanted: TraceOptions, seg: Uint8Array | null, onProgress?: (p: TraceProgress) => void): TraceJob {
  const options: TraceOptions = { ...wanted, nozzleMm: wanted.nozzleMm ?? nozzleMm() }; // o trecho fino segue o bico da impressora das ferramentas
  if (!worker) {
    const created = new Worker(new URL("./vectorize.worker.ts", import.meta.url), { type: "module" });
    worker = created;
    // ao sair da tela: encerra o worker (e o WASM do vtracer dentro dele); o próximo pedido cria outro
    onReleaseHeavy(() => {
      created.terminate();
      if (worker === created) worker = null;
    });
  }
  const w = worker;
  const id = ++seq;
  let finish: (err?: Error, done?: TraceDone) => void = () => {};
  const result = new Promise<TraceDone>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("A vetorização demorou demais. Tente uma imagem menor ou mais limpeza.")), TIMEOUT_MS);
    const onMsg = (e: MessageEvent<TraceMessage>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress?.({ stage: m.stage, ticks: m.ticks });
      else if (m.type === "done") finish(undefined, m);
      else finish(new Error(m.error));
    };
    const onErr = (ev: ErrorEvent) => finish(new Error(ev.message || "Falha no motor de vetorização."));
    finish = (err?: Error, done?: TraceDone) => {
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      if (err) {
        // cancelado, estourou o tempo ou falhou: descarta o worker (o próximo pedido cria outro)
        w.terminate();
        if (worker === w) worker = null;
        reject(err);
      } else resolve(done!);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    const msg: TraceRequest = { id, rgba: r.rgba.slice(), w: r.w, h: r.h, options, seg: seg?.slice() ?? null };
    w.postMessage(msg);
  });
  return { result, cancel: () => finish(new TraceCancelled()) };
}
