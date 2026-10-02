/** Imagem RGBA (como o ImageData do canvas). */
export type Rgba = { data: Uint8ClampedArray; width: number; height: number };
/** Um canal só, 0–255. */
export type Gray = { data: Uint8Array | Float32Array; width: number; height: number };

/**
 * Claridade de cada pixel = o menor dos canais R, G, B. Papel branco fica alto; ferramenta preta, cinza ou colorida
 * (cabo vermelho tem G e B baixos) fica baixa. Mesa de madeira também fica baixa, o que separa a folha.
 */
export function lightness(img: Rgba): Gray {
  const out = new Uint8Array(img.width * img.height);
  const d = img.data;
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = Math.min(d[j], d[j + 1], d[j + 2]);
  return { data: out, width: img.width, height: img.height };
}

/** Valor com interpolação bilinear (fora da imagem = borda mais próxima). */
export function sample(g: Gray, x: number, y: number): number {
  const fx = Math.min(Math.max(x - 0.5, 0), g.width - 1);
  const fy = Math.min(Math.max(y - 0.5, 0), g.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, g.width - 1);
  const y1 = Math.min(y0 + 1, g.height - 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const d = g.data;
  const top = d[y0 * g.width + x0] * (1 - ax) + d[y0 * g.width + x1] * ax;
  const bottom = d[y1 * g.width + x0] * (1 - ax) + d[y1 * g.width + x1] * ax;
  return top * (1 - ay) + bottom * ay;
}

/** Reduz por média de blocos `k`×`k` (rápido, sem serrilhado). */
export function shrink(g: Gray, k: number): Gray {
  const w = Math.floor(g.width / k);
  const h = Math.floor(g.height / k);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += g.data[(y * k + dy) * g.width + x * k + dx];
      out[y * w + x] = s / (k * k);
    }
  return { data: out, width: w, height: h };
}

/** Limiar de Otsu (0–255) de um conjunto de valores. */
export function otsu(values: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let at = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB || wB === total) continue;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at + 0.5;
}
