/** Modo colorido (docs/gestor3d-ferramentas.md §2.4): paleta em Lab, rótulos por pixel e máscaras empilhadas. Sem DOM. */
import { floodBackground } from "./raster";

export const BG = 255; // rótulo "fundo" (não imprime)

type Lab = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB 0–255 → CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const [R, G, B] = [r, g, b].map((v) => srgbToLinear(v / 255));
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
export const hexToRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

const MAX_SEEDS = 8;
const KMEANS_ITERS = 12;
const MAX_SAMPLES = 20_000;
const AA_T_MIN = 0.04;
const AA_T_MAX = 0.96;
const AA_DIST = 14; // ΔE: cor "entre" duas fortes = serrilhado
const ALPHA_BG = 16;

type Cluster = { lab: Lab; rgb: [number, number, number]; n: number };

/** Sementes por "ponto mais distante" + k-means nas amostras. */
function kmeans(samples: Lab[], rgbs: [number, number, number][], k: number): Cluster[] {
  const seeds: Lab[] = [samples[0]];
  const best = samples.map((s) => dist2(s, seeds[0]));
  while (seeds.length < k) {
    let far = 0;
    for (let i = 1; i < samples.length; i++) if (best[i] > best[far]) far = i;
    if (best[far] < 1) break; // não há mais cores distintas
    seeds.push(samples[far]);
    for (let i = 0; i < samples.length; i++) best[i] = Math.min(best[i], dist2(samples[i], samples[far]));
  }
  let cl: Cluster[] = seeds.map((lab) => ({ lab, rgb: [0, 0, 0], n: 0 }));
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < KMEANS_ITERS; it++) {
    const acc = cl.map(() => ({ l: [0, 0, 0], c: [0, 0, 0], n: 0 }));
    samples.forEach((s, i) => {
      let j = 0;
      for (let c = 1; c < cl.length; c++) if (dist2(s, cl[c].lab) < dist2(s, cl[j].lab)) j = c;
      assign[i] = j;
      const a = acc[j];
      a.n++;
      for (let d = 0; d < 3; d++) {
        a.l[d] += s[d];
        a.c[d] += rgbs[i][d];
      }
    });
    cl = acc.filter((a) => a.n).map((a) => ({ lab: a.l.map((v) => v / a.n) as Lab, rgb: a.c.map((v) => v / a.n) as [number, number, number], n: a.n }));
  }
  return cl;
}

/** Tira cores que ficam no segmento entre duas cores mais fortes (borda borrada do antisserrilhado). */
function dropAntialias(cl: Cluster[]): Cluster[] {
  const isAA = (c: Cluster) =>
    cl.some((a) =>
      cl.some((b) => {
        if (a === b || a === c || b === c || a.n <= c.n || b.n <= c.n) return false;
        const ab = [0, 1, 2].map((d) => b.lab[d] - a.lab[d]);
        const len2 = ab.reduce((s, v) => s + v * v, 0);
        if (!len2) return false;
        const t = [0, 1, 2].reduce((s, d) => s + (c.lab[d] - a.lab[d]) * ab[d], 0) / len2;
        if (t <= AA_T_MIN || t >= AA_T_MAX) return false;
        const p = [0, 1, 2].map((d) => a.lab[d] + t * ab[d]) as Lab;
        return Math.sqrt(dist2(c.lab, p)) < AA_DIST;
      }),
    );
  return cl.filter((c) => !isAA(c));
}

/** Funde as duas cores mais próximas até sobrar `k`. */
function mergeTo(cl: Cluster[], k: number): Cluster[] {
  const out = [...cl];
  while (out.length > k) {
    let bi = 0, bj = 1;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (dist2(out[i].lab, out[j].lab) < dist2(out[bi].lab, out[bj].lab)) [bi, bj] = [i, j];
    const [a, b] = [out[bi], out[bj]];
    const n = a.n + b.n;
    const mix = <T extends number[]>(x: T, y: T) => x.map((v, d) => (v * a.n + y[d] * b.n) / n) as T;
    out.splice(bj, 1);
    out[bi] = { lab: mix(a.lab, b.lab), rgb: mix(a.rgb, b.rgb), n };
  }
  return out;
}

/** Cada cor da imagem vira o filamento mais parecido, sem repetir; as cores de maior área (primeiras) escolhem antes. */
export function matchPalette(image: string[], filaments: string[]): string[] {
  const lab = (h: string) => rgbToLab(...hexToRgb(h));
  const free = [...new Set(filaments.map((f) => f.toLowerCase()))];
  return image.map((c) => {
    if (!free.length) return c;
    const l = lab(c);
    const j = free.reduce((best, f, i) => (dist2(l, lab(f)) < dist2(l, lab(free[best])) ? i : best), 0);
    return free.splice(j, 1)[0];
  });
}

const SMOOTH_PASSES = 2;

/** Moda 3×3 (só pixels de frente): some o pontilhado nas bordas entre cores. */
function modeFilter(labels: Uint8Array, w: number, h: number): Uint8Array {
  const out = labels.slice();
  const count = new Map<number, number>();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (labels[i] === BG) continue;
      count.clear();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const l = labels[i + dy * w + dx];
        if (l !== BG) count.set(l, (count.get(l) ?? 0) + 1);
      }
      let best = labels[i], bn = 0;
      for (const [l, n] of count) if (n > bn) [best, bn] = [l, n];
      if (bn >= 5) out[i] = best;
    }
  }
  return out;
}

/** Ilhas (componentes de uma cor) menores que `minPx` viram a cor vizinha mais comum. */
function absorbIslands(labels: Uint8Array, w: number, minPx: number): Uint8Array {
  const out = labels.slice();
  const seen = new Uint8Array(labels.length);
  const stack: number[] = [];
  for (let s = 0; s < out.length; s++) {
    if (seen[s] || out[s] === BG) continue;
    const l = out[s];
    const comp: number[] = [];
    const around = new Map<number, number>();
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= out.length) continue;
        if (out[j] === l) {
          if (!seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        } else around.set(out[j], (around.get(out[j]) ?? 0) + 1);
      }
    }
    if (comp.length >= minPx || !around.size) continue;
    const to = [...around].sort((a, b) => b[1] - a[1])[0][0];
    for (const i of comp) out[i] = to;
  }
  return out;
}

export type ColorOptions = { colors: number; removeBg: boolean; minAreaPx: number; filaments?: string[] };
export type Quantized = { labels: Uint8Array; palette: string[] };

/**
 * Imagem → rótulo por pixel (0..n-1, ou BG) e paleta em hex, ordenada da maior área para a menor.
 * Com `filaments`, cada cor encontrada é trocada pelo filamento mais parecido.
 */
export function quantize(rgba: Uint8ClampedArray, w: number, h: number, o: ColorOptions): Quantized {
  const n = w * h;
  const bg = o.removeBg ? floodBackground(rgba, w, h) : null;
  const over = (i: number, d: number) => {
    const a = rgba[i * 4 + 3] / 255;
    return rgba[i * 4 + d] * a + 255 * (1 - a);
  };
  const rgbAt = (i: number) => [over(i, 0), over(i, 1), over(i, 2)] as [number, number, number];
  const labF = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) labF.set(rgbToLab(...rgbAt(i)), i * 3);
  const labAt = (i: number): Lab => [labF[i * 3], labF[i * 3 + 1], labF[i * 3 + 2]];
  const fg = (i: number) => !bg?.[i] && rgba[i * 4 + 3] >= ALPHA_BG;
  const step = Math.max(1, Math.floor(n / MAX_SAMPLES));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) if (fg(i)) idx.push(i);
  if (!idx.length) throw new Error("A imagem ficou vazia depois de remover o fundo.");

  let cl = kmeans(idx.map(labAt), idx.map(rgbAt), MAX_SEEDS);
  cl = mergeTo(dropAntialias(cl), Math.max(1, Math.min(o.colors, cl.length)));

  let labels: Uint8Array = new Uint8Array(n).fill(BG);
  for (let i = 0; i < n; i++) {
    if (!fg(i)) continue;
    const p = labAt(i);
    let j = 0;
    for (let c = 1; c < cl.length; c++) if (dist2(p, cl[c].lab) < dist2(p, cl[j].lab)) j = c;
    labels[i] = j;
  }
  for (let p = 0; p < SMOOTH_PASSES; p++) labels = modeFilter(labels, w, h);
  labels = absorbIslands(labels, w, o.minAreaPx);

  // maior área primeiro: vira a camada de baixo (o fundo do empilhamento)
  const area = cl.map(() => 0);
  for (const l of labels) if (l !== BG) area[l]++;
  const order = cl.map((_, i) => i).filter((i) => area[i] > 0).sort((a, b) => area[b] - area[a]);
  const remap = new Uint8Array(256).fill(BG);
  order.forEach((old, i) => (remap[old] = i));
  labels = labels.map((l) => remap[l]);
  const image = order.map((i) => "#" + cl[i].rgb.map(hex2).join(""));
  return { labels, palette: o.filaments?.length ? matchPalette(image, o.filaments) : image };
}

/** Máscaras empilhadas: a camada k cobre as cores k..n-1. Pintadas em ordem, não sobra fresta entre cores. */
export function stackedMasks(labels: Uint8Array, count: number): Uint8Array[] {
  return Array.from({ length: count }, (_, k) => labels.map((l) => (l !== BG && l >= k ? 1 : 0)));
}
