/// <reference lib="webworker" />
import { traceColors } from "./colorTrace";
import { prepare, type TraceOptions } from "./pipeline";
import type { ColorLayer } from "./svgOut";
import { vectorizeMask } from "./vtrace";

export type TraceRequest = { id: number; rgba: Uint8ClampedArray; w: number; h: number; options: TraceOptions; seg: Uint8Array | null };
export type TraceDone = {
  id: number;
  type: "done";
  d: string;
  threshold: number;
  fillPct: number;
  thinCount: number;
  thin: Uint8Array | null;
  ms: number;
  layers?: ColorLayer[]; // modo colorido: uma camada empilhada por cor
};
export type TraceMessage =
  | TraceDone
  | { id: number; type: "progress"; stage: "prepare" | "trace"; ticks: number }
  | { id: number; type: "error"; error: string };

type Post = (m: TraceMessage) => void;

// O vtracer (WASM com top-level await) é importado sob demanda dentro de vectorizeMask,
// então o handler abaixo já está registrado quando a primeira mensagem chega.
self.onmessage = async (e: MessageEvent<TraceRequest>) => {
  const { id, rgba, w, h, options, seg } = e.data;
  const post: Post = (m) => self.postMessage(m);
  const t0 = performance.now();
  try {
    post({ id, type: "progress", stage: "prepare", ticks: 0 });
    if (options.colors > 1 && options.mode === "logo") {
      const { layers, fillPct } = await traceColors(rgba, w, h, options, (ticks) => post({ id, type: "progress", stage: "trace", ticks }));
      post({ id, type: "done", d: layers.map((l) => l.d).join(""), layers, threshold: 0, fillPct, thinCount: 0, thin: null, ms: performance.now() - t0 });
      return;
    }
    const p = prepare(rgba, w, h, options, seg);
    post({ id, type: "progress", stage: "trace", ticks: 0 });
    const d = await vectorizeMask(p.mask, w, h, options.detail, (ticks) => post({ id, type: "progress", stage: "trace", ticks }));
    post({ id, type: "done", d, threshold: p.threshold, fillPct: p.fillPct, thinCount: p.thinCount, thin: p.thin, ms: performance.now() - t0 });
  } catch (err) {
    post({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
