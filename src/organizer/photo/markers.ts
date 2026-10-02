import type { Sheet } from "../types";
import { apply, homography, type Pt } from "./homography";
import { shrink, type Gray } from "./image";
import { label } from "./segment";
import { order } from "./sheet";

/**
 * Folha de medição (#169): A4 ou Carta impressa com 4 marcadores nos cantos (quadrado preto com um quadrado branco
 * e um ponto preto no meio, como os "olhos" do QR code) e uma régua de 100 mm. Os marcadores aparecem em qualquer
 * fundo, até numa mesa branca; os cantos do papel saem deles pela homografia. Medidas em mm, folha em pé, y para baixo.
 */
export const LAYOUT = {
  /** Quadrado preto de fora, quadrado branco e ponto preto do meio (lados). */
  marker: 16,
  white: 10,
  dot: 4,
  /** Centro de cada marcador até as duas bordas do canto. */
  inset: 14,
  /** Faixas de cima e de baixo (marcadores, título e régua): ficam fora da medição das ferramentas. */
  band: 26,
  ruler: 100,
};

/** Centros dos 4 marcadores em mm (horário a partir do canto de cima à esquerda), folha em pé. */
export const markerCenters = (s: Sheet): Pt[] => {
  const [w, h, i] = [Math.min(s.widthMm, s.heightMm), Math.max(s.widthMm, s.heightMm), LAYOUT.inset];
  return [[i, i], [w - i, i], [w - i, h - i], [i, h - i]];
};

/** Tom impresso num ponto da folha em pé (para os testes desenharem a folha na foto sintética): 0 preto, null papel. */
export function printedTone(s: Sheet, x: number, y: number): number | null {
  for (const [cx, cy] of markerCenters(s)) {
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    if (d <= LAYOUT.dot / 2) return 20;
    if (d <= LAYOUT.white / 2) return null;
    if (d <= LAYOUT.marker / 2) return 20;
  }
  const w = Math.min(s.widthMm, s.heightMm);
  const h = Math.max(s.widthMm, s.heightMm);
  const ry = h - LAYOUT.inset;
  if (Math.abs(y - ry) < 0.2 && Math.abs(x - w / 2) <= LAYOUT.ruler / 2) return 20; // régua
  return null;
}

/**
 * Limiar local: escuro = menos de 60% da média da vizinhança (marcador preto em papel branco, qualquer luz). A
 * vizinhança (1/12 da foto, ~3 marcadores) é maior que o marcador, senão o miolo preto dele some.
 */
const DARK_SHARE = 0.6;

function darkMask(g: Gray): Uint8Array {
  const { width: w, height: h, data } = g;
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0, row = 0; x < w; x++) {
      row += data[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  const r = Math.max(15, Math.round(Math.max(w, h) / 24));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [x0, y0, x1, y1] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
      const mean = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = data[y * w + x] < mean * DARK_SHARE ? 1 : 0;
    }
  return out;
}

type Blob = { id: number; area: number; box: [number, number, number, number]; c: Pt };

/**
 * Centros dos marcadores na foto (px): um anel escuro quase quadrado com um ponto escuro bem no meio dele, de área
 * ~1/10 da do anel. Refinado na foto inteira pelo centro de massa do escuro (anel + ponto são simétricos).
 */
export function findMarkerCenters(g: Gray): Pt[] {
  const k = Math.max(1, Math.ceil(Math.max(g.width, g.height) / 1200));
  const small = k > 1 ? shrink(g, k) : g;
  const { width: w, height: h } = small;
  const mask = darkMask(small);
  const { labels, blobs } = label(mask, w, h);
  const withCenter: Blob[] = blobs.map((b) => {
    let [sx, sy] = [0, 0];
    for (let y = b.box[1]; y <= b.box[3]; y++)
      for (let x = b.box[0]; x <= b.box[2]; x++)
        if (labels[y * w + x] === b.id) {
          sx += x + 0.5;
          sy += y + 0.5;
        }
    return { ...b, c: [sx / b.area, sy / b.area] as Pt };
  });
  const rings = withCenter.filter((b) => {
    const [bw, bh] = [b.box[2] - b.box[0] + 1, b.box[3] - b.box[1] + 1];
    const fill = b.area / (bw * bh);
    return b.area >= 60 && bw / bh > 0.4 && bw / bh < 2.5 && fill > 0.3 && fill < 0.85;
  });
  const found: Pt[] = [];
  for (const ring of rings) {
    const size = Math.max(ring.box[2] - ring.box[0], ring.box[3] - ring.box[1]) + 1;
    const dot = withCenter.find(
      (b) => b.id !== ring.id && Math.hypot(b.c[0] - ring.c[0], b.c[1] - ring.c[1]) < 0.15 * size && b.area > ring.area * 0.03 && b.area < ring.area * 0.35,
    );
    if (dot) found.push(refineCenter(g, ring.box, k));
  }
  return found;
}

/** Centro de massa do que é escuro dentro da caixa do marcador, na foto inteira. */
function refineCenter(g: Gray, box: [number, number, number, number], k: number): Pt {
  const [x0, y0, x1, y1] = [Math.max(0, (box[0] - 1) * k), Math.max(0, (box[1] - 1) * k), Math.min(g.width - 1, (box[2] + 2) * k), Math.min(g.height - 1, (box[3] + 2) * k)];
  let [lo, hi] = [255, 0];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = g.data[y * g.width + x];
      [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
    }
  const mid = (lo + hi) / 2;
  let [sx, sy, n] = [0, 0, 0];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = g.data[y * g.width + x];
      if (v >= mid) continue;
      const wgt = (mid - v) / (mid - lo); // borda em meio-tom pesa menos
      sx += (x + 0.5) * wgt;
      sy += (y + 0.5) * wgt;
      n += wgt;
    }
  return [sx / n, sy / n];
}

/**
 * Cantos do papel na foto a partir dos 4 marcadores (mesma ordem horária). Os lados mais longos do quadrilátero dos
 * marcadores são os lados compridos da folha. null = não achou exatamente 4 marcadores (ou mais de 4 sem um
 * quadrilátero convexo claro).
 */
export function sheetFromMarkers(centers: Pt[], s: Sheet): Pt[] | null {
  if (centers.length < 4) return null;
  const quad = pickFour(centers);
  if (!quad) return null;
  const q = order(quad);
  const side = (i: number) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
  const [w, h, i] = [Math.min(s.widthMm, s.heightMm), Math.max(s.widthMm, s.heightMm), LAYOUT.inset];
  // folha em pé com o lado 0→1 curto; se o lado 0→1 for o comprido, ela está deitada na foto
  const wide = side(0) + side(2) > side(1) + side(3);
  const [W, H] = wide ? [h, w] : [w, h];
  const toPhoto = homography([[i, i], [W - i, i], [W - i, H - i], [i, H - i]], q);
  if (!toPhoto) return null;
  return ([[0, 0], [W, 0], [W, H], [0, H]] as Pt[]).map((p) => apply(toPhoto, p));
}

/** Com mais de 4 candidatos, os 4 que formam o maior quadrilátero (os marcadores ficam nos cantos da folha). */
function pickFour(c: Pt[]): Pt[] | null {
  if (c.length === 4) return c;
  if (c.length > 8) return null; // muito ruído: melhor não arriscar
  let best: Pt[] | null = null;
  let bestArea = 0;
  for (let a = 0; a < c.length; a++)
    for (let b = a + 1; b < c.length; b++)
      for (let d = b + 1; d < c.length; d++)
        for (let e = d + 1; e < c.length; e++) {
          const q = order([c[a], c[b], c[d], c[e]]);
          const area = Math.abs(q.reduce((t, p, i) => t + p[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * p[1], 0)) / 2;
          if (area > bestArea) [bestArea, best] = [area, q];
        }
  return best;
}
