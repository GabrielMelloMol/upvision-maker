import { extractPaths } from "./svgOut";

const DEG = Math.PI / 180;
const PROGRESS_EVERY = 50;

/** Máscara → `d` único do SVG, via vtracer (WASM). `detail` 1–10: menor = menos nós. */
export async function vectorizeMask(mask: Uint8Array, w: number, h: number, detail: number, onTick?: (n: number) => void): Promise<string> {
  const { BinaryImageConverter } = await import("vectortracer");
  // vectortracer considera forma o pixel com vermelho < 128
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  const d = Math.min(10, Math.max(1, detail));
  const conv = new BinaryImageConverter(
    new ImageData(px, w, h),
    { debug: false, mode: "spline", cornerThreshold: 60 * DEG, lengthThreshold: 3.5 + (10 - d) * 0.8, maxIterations: 10, spliceThreshold: 45 * DEG, filterSpeckle: 2, pathPrecision: 2 },
    { invert: false, pathFill: "#000", backgroundColor: "white", attributes: "", scale: 1 },
  );
  try {
    conv.init();
    let n = 0;
    while (!conv.tick()) if (++n % PROGRESS_EVERY === 0) onTick?.(n);
    return extractPaths(conv.getResult());
  } finally {
    conv.free();
  }
}
