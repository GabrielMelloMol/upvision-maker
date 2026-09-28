/// <reference lib="webworker" />
import { prepare, type TraceOptions } from "./pipeline";
import { extractPaths } from "./svgOut";

export type TraceRequest = { id: number; rgba: Uint8ClampedArray; w: number; h: number; options: TraceOptions };
export type TraceResponse =
  | { id: number; ok: true; d: string; threshold: number; fillPct: number; thinCount: number; thin: Uint8Array | null; ms: number }
  | { id: number; ok: false; error: string };

const DEG = Math.PI / 180;

// Import dinâmico: o WASM usa top-level await; com import estático o handler só seria registrado
// depois do carregamento e a primeira mensagem se perderia.
const vtracer = import("vectortracer");

self.onmessage = async (e: MessageEvent<TraceRequest>) => {
  const { id, rgba, w, h, options } = e.data;
  const t0 = performance.now();
  try {
    const { BinaryImageConverter } = await vtracer;
    const p = prepare(rgba, w, h, options);
    // vectortracer considera forma o pixel com vermelho < 128
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < p.mask.length; i++) {
      const v = p.mask[i] ? 0 : 255;
      px.set([v, v, v, 255], i * 4);
    }
    const conv = new BinaryImageConverter(
      new ImageData(px, w, h),
      { debug: false, mode: "spline", cornerThreshold: 60 * DEG, lengthThreshold: 4, maxIterations: 10, spliceThreshold: 45 * DEG, filterSpeckle: 2, pathPrecision: 3 },
      { invert: false, pathFill: "#000", backgroundColor: "white", attributes: "", scale: 1 },
    );
    conv.init();
    while (!conv.tick()) {
      /* processa todos os clusters */
    }
    const svg = conv.getResult();
    conv.free();
    const d = extractPaths(svg);
    const msg: TraceResponse = { id, ok: true, d, threshold: p.threshold, fillPct: p.fillPct, thinCount: p.thinCount, thin: p.thin, ms: performance.now() - t0 };
    self.postMessage(msg);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies TraceResponse);
  }
};
