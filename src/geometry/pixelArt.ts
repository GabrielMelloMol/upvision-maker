import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { backing, roundedRect, slab, solidMesh, type TextFn } from "./models/common";
import { scoped } from "./shape2d";
import type { Model, Part } from "./types";
import { BG, quantize } from "../vectorize/palette";

/*
 * Pixel art (#95): imagem → grade N×M com as cores dos filamentos; saídas mosaico, quebra-cabeça e ímã.
 * `cells[r * cols + c]` é o índice na `palette` (−1 = vazio); a linha 0 é a de cima da imagem.
 */
export type PixelGrid = { cols: number; rows: number; cells: number[]; palette: string[] };

export type PixelOutput = "mosaic" | "puzzle" | "magnet";
export type PixelOptions = {
  output: PixelOutput;
  pixel: number; // lado de cada pixel (mm)
  base: number; // mosaico/ímã: fundo
  relief: number; // mosaico/ímã: altura dos pixels sobre o fundo
  border: number; // mosaico/ímã: borda do fundo em volta do desenho
  baseColor: string;
  magnetD: number;
  magnetH: number;
  clearance: number; // quebra-cabeça: folga de cada pixel solto
  pocket: number; // quebra-cabeça: profundidade do encaixe
  floor: number; // quebra-cabeça: fundo da bandeja
  tileExtra: number; // quanto o pixel solto sobra acima da bandeja (para pegar)
  marks: "number" | "color" | "none";
};

export const DEFAULT_PIXEL_OPTIONS: PixelOptions = {
  output: "mosaic",
  pixel: 6,
  base: 1.2,
  relief: 1.2,
  border: 2,
  baseColor: "#f8f8f6",
  magnetD: 10,
  magnetH: 3,
  clearance: 0.2,
  pocket: 2,
  floor: 1.2,
  tileExtra: 0.6,
  marks: "number",
};

export const MIN_SIZE = 8;
export const MAX_SIZE = 64;
const ALPHA_EMPTY = 128;
const MAGNET_PLAY = 0.3; // no diâmetro
const MAGNET_DEPTH_PLAY = 0.2;
const MAGNET_ROOF = 0.8; // fundo que sobra em cima do ímã
const MARK_DEPTH = 0.4;
const MARK_TEXT = 0.45; // altura do número em relação ao pixel
const MARK_SQUARE = 0.5;
const TRAY_BORDER = 3;
const TILE_GAP = 2;
const BED_MM = 256;
const EPS = 0.01;

/**
 * Imagem RGBA → grade com o lado maior em `size` pixels (8 a 64), no máximo `colors` cores, trocadas pelos
 * `filaments` mais parecidos quando houver. Média da área de cada pixel; transparente vira vazio.
 */
export function pixelate(rgba: Uint8ClampedArray, w: number, h: number, size: number, colors: number, filaments?: string[]): PixelGrid {
  const n = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
  const cols = w >= h ? n : Math.max(1, Math.round((n * w) / h));
  const rows = w >= h ? Math.max(1, Math.round((n * h) / w)) : n;
  const small = new Uint8ClampedArray(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / cols));
      const y0 = Math.floor((r * h) / rows), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / rows));
      let R = 0, G = 0, B = 0, A = 0, count = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4, a = rgba[i + 3];
          R += rgba[i] * a;
          G += rgba[i + 1] * a;
          B += rgba[i + 2] * a;
          A += a;
          count++;
        }
      const o = (r * cols + c) * 4;
      small.set(A ? [R / A, G / A, B / A, A / count] : [0, 0, 0, 0], o);
    }
  const q = quantize(small, cols, rows, { colors, removeBg: false, minAreaPx: 0, filaments, smooth: false });
  const cells = Array.from(q.labels, (l, i) => (l === BG || small[i * 4 + 3] < ALPHA_EMPTY ? -1 : l));
  return { cols, rows, cells, palette: q.palette };
}

/** Pinta (índice da paleta) ou apaga (−1) um pixel; devolve uma grade nova. */
export function paint(g: PixelGrid, col: number, row: number, value: number): PixelGrid {
  const i = row * g.cols + col;
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows || g.cells[i] === value) return g;
  return { ...g, cells: g.cells.map((v, j) => (j === i ? value : v)) };
}

/** Índice da cor na paleta, acrescentando se ainda não estiver. */
export function withColor(g: PixelGrid, hex: string): [PixelGrid, number] {
  const i = g.palette.indexOf(hex.toLowerCase());
  return i >= 0 ? [g, i] : [{ ...g, palette: [...g.palette, hex.toLowerCase()] }, g.palette.length];
}

/** Troca a cor `idx` por `hex` em todos os pixels; se `hex` já está na paleta, as duas se juntam. */
export function replaceColor(g: PixelGrid, idx: number, hex: string): PixelGrid {
  const to = g.palette.indexOf(hex.toLowerCase());
  if (to < 0) return { ...g, palette: g.palette.map((c, i) => (i === idx ? hex.toLowerCase() : c)) };
  if (to === idx) return g;
  const target = to > idx ? to - 1 : to;
  return {
    ...g,
    palette: g.palette.filter((_, i) => i !== idx),
    cells: g.cells.map((v) => (v === idx ? target : v > idx ? v - 1 : v)),
  };
}

/** Quantos pixels de cada cor. */
export const colorCounts = (g: PixelGrid): number[] => g.palette.map((_, i) => g.cells.filter((v) => v === i).length);

type K = <D extends { delete(): void }>(o: D) => D;

/** Região dos pixels que passam em `pred` (linhas juntadas em retângulos), centrada na origem. */
function region(M: ManifoldToplevel, g: PixelGrid, p: number, pred: (v: number) => boolean): CS {
  const rects: CS[] = [];
  const x0 = (-g.cols * p) / 2, y0 = (g.rows * p) / 2;
  for (let r = 0; r < g.rows; r++) {
    let c = 0;
    while (c < g.cols) {
      if (!pred(g.cells[r * g.cols + c])) {
        c++;
        continue;
      }
      const start = c;
      while (c < g.cols && pred(g.cells[r * g.cols + c])) c++;
      rects.push(M.CrossSection.square([(c - start) * p, p]).translate([x0 + start * p, y0 - (r + 1) * p]));
    }
  }
  const out = M.CrossSection.union(rects);
  rects.forEach((x) => x.delete());
  return out;
}

const cellCenter = (g: PixelGrid, p: number, i: number): [number, number] => [(-g.cols * p) / 2 + ((i % g.cols) + 0.5) * p, (g.rows * p) / 2 - (Math.floor(i / g.cols) + 0.5) * p];
const used = (g: PixelGrid) => g.palette.map((color, i) => ({ color, i })).filter(({ i }) => g.cells.includes(i));

function mosaic(M: ManifoldToplevel, k: K, g: PixelGrid, o: PixelOptions, warnings: string[]): Model {
  const magnet = o.output === "magnet";
  const base = magnet ? Math.max(o.base, o.magnetH + MAGNET_DEPTH_PLAY + MAGNET_ROOF) : o.base;
  if (magnet && base > o.base) warnings.push(`Fundo engrossado para ${base.toFixed(1).replace(".", ",")} mm para caber o ímã.`);
  const all = k(region(M, g, o.pixel, (v) => v >= 0));
  const parts: Part[] = [];
  if (base > 0) {
    const shape = o.border > 0 ? k(backing(M, all, o.border)) : all;
    let s: Solid = k(shape.extrude(base));
    if (magnet) {
      const b = all.bounds();
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
      const r = (o.magnetD + MAGNET_PLAY) / 2;
      const hole = k(k(M.CrossSection.circle(r, 64)).translate([cx, cy]));
      if (k(hole.intersect(shape)).area() < hole.area() * 0.99) warnings.push("O ímã não cabe inteiro no centro do desenho: aumente o pixel ou a borda.");
      s = k(s.subtract(k(k(hole.extrude(o.magnetH + MAGNET_DEPTH_PLAY + EPS)).translate([0, 0, -EPS]))));
    }
    parts.push({ name: "Fundo", color: o.baseColor, mesh: solidMesh(s) });
  }
  for (const { color, i } of used(g)) parts.push({ name: `Cor ${i + 1}`, color, mesh: slab(k(region(M, g, o.pixel, (v) => v === i)), o.relief, base) });
  return { name: magnet ? "Ímã" : "Mosaico", parts };
}

function puzzle(M: ManifoldToplevel, k: K, g: PixelGrid, o: PixelOptions, text: TextFn): Model[] {
  const p = o.pixel;
  const H = o.floor + o.pocket;
  const traySize = k(roundedRect(M, g.cols * p + 2 * TRAY_BORDER, g.rows * p + 2 * TRAY_BORDER, 2));
  const pockets = k(region(M, g, p, (v) => v >= 0));
  let tray: Solid = k(k(traySize.extrude(H)).subtract(k(k(pockets.extrude(o.pocket + EPS)).translate([0, 0, o.floor]))));
  const marks: Part[] = [];
  const colors = used(g);
  if (o.marks !== "none") {
    for (const { color, i } of colors) {
      const cells = g.cells.flatMap((v, j) => (v === i ? [j] : []));
      const glyph = o.marks === "number" ? text(String(i + 1), p * MARK_TEXT) : M.CrossSection.square([p * MARK_SQUARE, p * MARK_SQUARE], true);
      if (!glyph) continue;
      k(glyph);
      const placed = k(M.CrossSection.union(cells.map((j) => k(glyph.translate(cellCenter(g, p, j))))));
      const cut = k(k(placed.extrude(MARK_DEPTH + EPS)).translate([0, 0, o.floor - MARK_DEPTH]));
      tray = k(tray.subtract(cut));
      if (o.marks === "color") marks.push({ name: `Marca cor ${i + 1}`, color, mesh: slab(placed, MARK_DEPTH, o.floor - MARK_DEPTH) });
    }
  }
  const trayModel: Model = { name: "Bandeja", parts: [{ name: "Bandeja", color: o.baseColor, mesh: solidMesh(tray) }, ...marks] };
  // pixels soltos: uma mesa por cor, em grade quase quadrada
  const side = p - o.clearance;
  const tile = k(M.CrossSection.square([side, side], true));
  const tiles = colors.map(({ color, i }): Model => {
    const count = g.cells.filter((v) => v === i).length;
    const per = Math.ceil(Math.sqrt(count));
    const step = side + TILE_GAP;
    const placed = k(M.CrossSection.union(Array.from({ length: count }, (_, t) => k(tile.translate([(t % per) * step - ((per - 1) * step) / 2, Math.floor(t / per) * step - ((per - 1) * step) / 2])))));
    return { name: `Pixels cor ${i + 1} (${count})`, parts: [{ name: `Cor ${i + 1}`, color, mesh: slab(placed, o.pocket + o.tileExtra) }] };
  });
  return [trayModel, ...tiles];
}

/** Grade → peças: mosaico multicor, ímã (mosaico com furo embaixo) ou quebra-cabeça (bandeja + pixels soltos por cor). */
export function buildPixelArt(M: ManifoldToplevel, g: PixelGrid, o: PixelOptions, text: TextFn): { models: Model[]; warnings: string[] } {
  if (!g.cells.some((v) => v >= 0)) throw new Error("A grade está vazia: pinte alguns pixels.");
  const warnings: string[] = [];
  const size = Math.max(g.cols, g.rows) * o.pixel + 2 * (o.output === "puzzle" ? TRAY_BORDER : o.border);
  if (size > BED_MM) warnings.push(`A peça tem ${Math.round(size)} mm e passa da mesa de ${BED_MM} mm: diminua o pixel ou a grade.`);
  if (o.output === "puzzle" && o.marks === "number" && o.pixel * MARK_TEXT < 3) warnings.push("Números muito pequenos para ler: use pixel de 7 mm ou mais.");
  const models = scoped((k) => (o.output === "puzzle" ? puzzle(M, k, g, o, text) : [mosaic(M, k, g, o, warnings)]));
  return { models, warnings };
}
