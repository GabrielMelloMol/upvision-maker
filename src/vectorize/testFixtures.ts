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

export type SynthShape =
  | { kind: "circle"; cx: number; cy: number; r: number; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { kind: "ring"; cx: number; cy: number; r: number; inner: number; color: string };

const inside = (s: SynthShape, x: number, y: number) =>
  s.kind === "circle"
    ? Math.hypot(x - s.cx, y - s.cy) <= s.r
    : s.kind === "rect"
      ? x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h
      : Math.hypot(x - s.cx, y - s.cy) <= s.r && Math.hypot(x - s.cx, y - s.cy) >= s.inner;

/** Imagem sintética com antisserrilhado (4×4 amostras por pixel) e ruído leve tipo JPEG (determinístico). */
export function synthImage(w: number, h: number, bg: string, shapes: SynthShape[], noise = 0) {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgba = new Uint8ClampedArray(w * h * 4);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
        let c = bg;
        for (const s of shapes) if (inside(s, px, py)) c = s.color;
        rgb(c).forEach((v, d) => (acc[d] += v / 16));
      }
      const i = (y * w + x) * 4;
      for (let d = 0; d < 3; d++) rgba[i + d] = acc[d] + rand() * noise;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, w, h };
}
