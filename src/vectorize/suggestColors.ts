export type SuggestedColors = { base: string; relief: string };

const MAX_SAMPLES = 20_000;
const MIN_PIXELS = 50;
const MIN_GAP = 60; // diferença de luminância (0 a 255) abaixo da qual base e relevo se confundiriam
const INK = "#1c1c1e";
const PAPER = "#ffffff";

const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

function mean(px: number[][]): number[] {
  const s = px.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return s.map((v) => v / px.length);
}

/** Limiar de Otsu sobre luminâncias 0–255: separa os tons claros dos escuros do objeto. */
function split(ls: number[]): number {
  const hist = new Array<number>(256).fill(0);
  for (const l of ls) hist[Math.min(255, Math.round(l))]++;
  let sumAll = 0;
  hist.forEach((n, i) => (sumAll += n * i));
  let wB = 0, sumB = 0, best = 0, at = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = ls.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at;
}

/**
 * Cores sugeridas para a peça a partir da imagem: a base fica com os tons claros do objeto e o relevo com os escuros (um gato
 * preto e branco: base branca, relevo preto). `object` (1 = objeto) deixa o fundo de fora. Sem contraste, o relevo é preto ou
 * branco, o que contrastar com a base. Devolve null se a imagem não tem pixels suficientes.
 */
export function suggestColors(rgba: Uint8ClampedArray, w: number, h: number, object: Uint8Array | null): SuggestedColors | null {
  const total = w * h;
  const step = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const px: number[][] = [];
  for (let i = 0; i < total; i += step) {
    if (rgba[i * 4 + 3] < 128 || (object && !object[i])) continue;
    px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  }
  if (px.length < MIN_PIXELS) return null;
  const ls = px.map(lum);
  const t = split(ls);
  const darkPx = px.filter((_, i) => ls[i] <= t), lightPx = px.filter((_, i) => ls[i] > t);
  if (!darkPx.length || !lightPx.length) return { base: hex(mean(px)), relief: lum(mean(px)) > 128 ? INK : PAPER };
  const dark = mean(darkPx), light = mean(lightPx);
  if (lum(light) - lum(dark) < MIN_GAP) return { base: hex(mean(px)), relief: lum(mean(px)) > 128 ? INK : PAPER };
  return { base: hex(light), relief: hex(dark) };
}
