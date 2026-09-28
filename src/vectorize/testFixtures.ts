import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import jpeg from "jpeg-js";

/** Decodifica uma imagem de tests/fixtures (JPEG) para RGBA. Só para testes (Node). */
export function loadFixture(name: string, maxSide = 0): { rgba: Uint8ClampedArray; w: number; h: number } {
  const img = jpeg.decode(readFileSync(resolve(__dirname, "../../tests/fixtures", name)), { useTArray: true, formatAsRGBA: true });
  const rgba = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length);
  if (!maxSide) return { rgba, w: img.width, h: img.height };
  return resizeBilinear(rgba, img.width, img.height, maxSide / Math.max(img.width, img.height));
}

/** Reamostragem bilinear (equivalente simples ao drawImage do canvas no app). */
export function resizeBilinear(src: Uint8ClampedArray, w: number, h: number, s: number) {
  const W = Math.round(w * s);
  const H = Math.round(h * s);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + 0.5) / s - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / s - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx;
        const b = src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx;
        out[(y * W + x) * 4 + c] = a * (1 - fy) + b * fy;
      }
    }
  }
  return { rgba: out, w: W, h: H };
}
