const SAMPLE_SIDE = 200;

export type ImageKind = { isPhoto: boolean; uniqueColors: number; edgeDensity: number };

/** Estatísticas numa amostra de ~200 px: cores únicas (15 bits) e fração de vizinhos com salto de cor. */
export function imageStats(rgba: Uint8ClampedArray, w: number, h: number, edgeStep: number) {
  const step = Math.max(1, Math.floor(Math.max(w, h) / SAMPLE_SIDE));
  const colors = new Set<number>();
  let edges = 0, pairs = 0;
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = rgba[i + 3] / 255;
    return [0, 1, 2].map((c) => rgba[i + c] * a + 255 * (1 - a));
  };
  for (let y = 0; y + step < h; y += step) {
    for (let x = 0; x + step < w; x += step) {
      const p = px(x, y);
      colors.add(((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3));
      for (const q of [px(x + step, y), px(x, y + step)]) {
        pairs++;
        if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > edgeStep) edges++;
      }
    }
  }
  return { uniqueColors: colors.size, edgeDensity: pairs ? edges / pairs : 0 };
}

// Calibrado com tests/fixtures: foto 2157 cores / 32% bordas; logo JPEG 358 / 9%; desenho 43 / 6%.
const PHOTO_COLORS = 1000;
const MIXED_COLORS = 400;
const PHOTO_EDGES = 0.18;
const EDGE_STEP = 12;

/** "Parece foto?" — muitas cores únicas, ou cores moderadas com muita textura. */
export function classifyImage(rgba: Uint8ClampedArray, w: number, h: number): ImageKind {
  const { uniqueColors, edgeDensity } = imageStats(rgba, w, h, EDGE_STEP);
  const isPhoto = uniqueColors >= PHOTO_COLORS || (uniqueColors >= MIXED_COLORS && edgeDensity >= PHOTO_EDGES);
  return { isPhoto, uniqueColors, edgeDensity };
}
