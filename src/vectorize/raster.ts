/** Pré-processamento da imagem antes do vtracer (tudo em arrays, sem DOM, roda no worker). */

const TARGET_PX = 1200;
const MAX_UPSCALE = 4;
const MAX_SIDE = 4096;
const MAX_PIXELS = 6e6;

/** Fator de reamostragem: amplia imagens pequenas para ~1200 px (curvas lisas), com tetos de lado e de área. */
export function scaleFactor(w: number, h: number): number {
  const side = Math.max(w, h);
  const up = Math.min(Math.max(TARGET_PX / side, 1), MAX_UPSCALE);
  return Math.min(up, MAX_SIDE / side, Math.sqrt(MAX_PIXELS / (w * h)));
}

const ALPHA_BG = 16;

/** Luminância BT.709 composta sobre branco (PNG transparente vira fundo). */
export function luminance(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const [r, g, b, a] = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]];
    if (a < ALPHA_BG) {
      out[i] = 255;
      continue;
    }
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = Math.round((l * a + 255 * (255 - a)) / 255);
  }
  return out;
}

/** Limiar de Otsu (maximiza a variância entre classes). */
export function otsu(lum: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of lum) hist[v]++;
  const total = lum.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0, sumB = 0, best = 0, bestT = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      bestT = t + 1; // selecionado = lum < T
    }
  }
  return bestT;
}

/** 1 = forma. Normal: escuro é forma. Invertido: claro é forma (fundo escuro). */
export function binarize(lum: Uint8Array, threshold: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = (invert ? lum[i] >= threshold : lum[i] < threshold) ? 1 : 0;
  return out;
}

const DOMINANT_MIN = 0.35;
const REMOVE_MIN = 0.02;
const REMOVE_MAX = 0.96;
const COLOR_TOL = 48; // distância RGB (0–441)

/**
 * Fundo = cor dominante da borda (≥ 35% do perímetro), inundada a partir da borda.
 * Retorna máscara (1 = fundo) ou null se não há fundo claro ou se removeria quase nada/quase tudo.
 */
export function floodBackground(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const rgb = (i: number): [number, number, number] => {
    const a = rgba[i * 4 + 3] / 255;
    return [0, 1, 2].map((c) => rgba[i * 4 + c] * a + 255 * (1 - a)) as [number, number, number];
  };
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const buckets = new Map<number, number[]>();
  for (const i of border) {
    const [r, g, b] = rgb(i);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.length - a.length)[0];
  if (!dominant || dominant.length / border.length < DOMINANT_MIN) return null;
  const ref = [0, 1, 2].map((c) => dominant.reduce((s, i) => s + rgb(i)[c], 0) / dominant.length);
  const near = (i: number) => {
    const p = rgb(i);
    return Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]) <= COLOR_TOL;
  };

  const bg = new Uint8Array(w * h);
  const stack = border.filter(near);
  for (const i of stack) bg[i] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j >= 0 && j < w * h && !bg[j] && near(j)) {
        bg[j] = 1;
        stack.push(j);
      }
    }
  }
  const frac = bg.reduce((s, v) => s + v, 0) / (w * h);
  return frac < REMOVE_MIN || frac > REMOVE_MAX ? null : bg;
}

/** Mínimo (erosão) ou máximo (dilatação) numa janela quadrada 2r+1, separável. Fora da imagem = 0. */
function morph(mask: Uint8Array, w: number, h: number, r: number, erode: boolean): Uint8Array {
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r && v === (erode ? 1 : 0); k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
          v = erode ? Math.min(v, s) : Math.max(v, s);
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

export const openMask = (mask: Uint8Array, w: number, h: number, r: number) => morph(morph(mask, w, h, r, true), w, h, r, false);

/** Pixels da forma mais finos que 2r+1 px (somem numa abertura de raio r). */
export function thinPixels(mask: Uint8Array, w: number, h: number, r: number): { count: number; thin: Uint8Array } {
  const open = openMask(mask, w, h, r);
  const thin = new Uint8Array(mask.length);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && !open[i]) {
      thin[i] = 1;
      count++;
    }
  }
  return { count, thin };
}
