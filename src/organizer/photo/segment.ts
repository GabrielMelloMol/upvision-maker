import { apply, type Mat3 } from "./homography";
import { sample, type Gray } from "./image";

/** Resolução da folha endireitada. */
export const PX_PER_MM = 10;

/** Folha endireitada: cada pixel é 0,1 mm × 0,1 mm, origem no canto 0 da folha, y para baixo. */
export function rectify(g: Gray, sheetToPhoto: Mat3, widthMm: number, heightMm: number): Gray {
  const w = Math.round(widthMm * PX_PER_MM);
  const h = Math.round(heightMm * PX_PER_MM);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = apply(sheetToPhoto, [(x + 0.5) / PX_PER_MM, (y + 0.5) / PX_PER_MM]);
      out[y * w + x] = sample(g, u, v);
    }
  return { data: out, width: w, height: h };
}

const BLOCK_MM = 15;

/**
 * Claridade do papel em cada ponto (a luz nunca é igual na folha toda): blocos de 15 mm com o percentil 90 de cada um;
 * blocos tomados por uma ferramenta (bem mais escuros que o papel típico) são preenchidos pelos vizinhos.
 * Devolve uma grade pequena e a função que interpola nela.
 */
export function paperLevel(g: Gray): (x: number, y: number) => number {
  const b = BLOCK_MM * PX_PER_MM;
  const bw = Math.ceil(g.width / b);
  const bh = Math.ceil(g.height / b);
  const grid = new Float32Array(bw * bh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      let n = 0;
      for (let y = by * b; y < Math.min(g.height, (by + 1) * b); y += 2)
        for (let x = bx * b; x < Math.min(g.width, (bx + 1) * b); x += 2) {
          hist[g.data[y * g.width + x]]++;
          n++;
        }
      let acc = 0;
      let v = 255;
      for (let i = 0; i < 256; i++) {
        acc += hist[i];
        if (acc >= n * 0.9) {
          v = i;
          break;
        }
      }
      grid[by * bw + bx] = v;
    }
  const sorted = [...grid].sort((a, c) => a - c);
  const typical = sorted[Math.floor(sorted.length / 2)];
  const valid = grid.map((v) => (v >= typical * 0.8 ? 1 : 0));
  for (let round = 0; round < bw + bh && valid.some((v) => !v); round++) {
    const copy = Float32Array.from(grid);
    const ok = Uint8Array.from(valid);
    for (let i = 0; i < grid.length; i++) {
      if (ok[i]) continue;
      const x = i % bw;
      let s = 0;
      let n = 0;
      for (const j of [i - bw, i + bw, x > 0 ? i - 1 : -1, x < bw - 1 ? i + 1 : -1])
        if (j >= 0 && j < grid.length && ok[j]) {
          s += copy[j];
          n++;
        }
      if (n) {
        grid[i] = s / n;
        valid[i] = 1;
      }
    }
  }
  if (valid.some((v) => !v)) grid.fill(typical);
  return (x, y) => {
    const fx = Math.min(Math.max(x / b - 0.5, 0), bw - 1);
    const fy = Math.min(Math.max(y / b - 0.5, 0), bh - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, bw - 1);
    const y1 = Math.min(y0 + 1, bh - 1);
    const ax = fx - x0;
    const ay = fy - y0;
    const top = grid[y0 * bw + x0] * (1 - ax) + grid[y0 * bw + x1] * ax;
    const bottom = grid[y1 * bw + x0] * (1 - ax) + grid[y1 * bw + x1] * ax;
    return top * (1 - ay) + bottom * ay;
  };
}

/** Escurecimento relativo ao papel em cada pixel: 1 = papel, 0 = preto. */
export function relative(g: Gray): Float32Array {
  const level = paperLevel(g);
  const out = new Float32Array(g.width * g.height);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) out[y * g.width + x] = g.data[y * g.width + x] / Math.max(1, level(x + 0.5, y + 0.5));
  }
  return out;
}

/**
 * Limiar no meio do caminho entre o papel (1) e o tom típico das ferramentas: a borda borrada da foto cai exatamente
 * na metade, então o contorno não engorda nem emagrece. Limitado a 0,45–0,75 para não pegar sombra leve.
 */
export function threshold(rel: Float32Array): number {
  const dark: number[] = [];
  for (let i = 0; i < rel.length; i += 7) if (rel[i] < 0.45) dark.push(rel[i]);
  if (dark.length < 50) return 0.6;
  dark.sort((a, b) => a - b);
  const tone = dark[Math.floor(dark.length / 2)];
  return Math.min(0.75, Math.max(0.45, (1 + tone) / 2));
}

/** Erosão/dilatação com quadrado de lado 2r+1 (separável). */
function morph(mask: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  const want = grow ? 1 : 0;
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = src[y * w + x];
        if (v !== want)
          for (let d = -r; d <= r; d++) {
            const xx = horizontal ? x + d : x;
            const yy = horizontal ? y : y + d;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            if (src[yy * w + xx] === want) {
              v = want;
              break;
            }
          }
        out[y * w + x] = v;
      }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Fecha falhas finas e tira pontinhos (0,3 mm). */
export function clean(mask: Uint8Array, w: number, h: number): Uint8Array {
  const r = 3;
  const closed = morph(morph(mask, w, h, r, true), w, h, r, false);
  return morph(morph(closed, w, h, r, false), w, h, r, true);
}

export type Blob = { id: number; area: number; box: [number, number, number, number] };

/** Regiões 4-conectadas da máscara. */
export function label(mask: Uint8Array, w: number, h: number): { labels: Int32Array; blobs: Blob[] } {
  const labels = new Int32Array(w * h);
  const blobs: Blob[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    const id = blobs.length + 1;
    let [x0, y0, x1, y1, area] = [w, h, -1, -1, 0];
    const stack = [s];
    labels[s] = id;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const n of [y > 0 ? i - w : -1, y < h - 1 ? i + w : -1, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1])
        if (n >= 0 && mask[n] && !labels[n]) {
          labels[n] = id;
          stack.push(n);
        }
    }
    blobs.push({ id, area, box: [x0, y0, x1, y1] });
  }
  return { labels, blobs };
}
