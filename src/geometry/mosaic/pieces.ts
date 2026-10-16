import { bedMm } from "../bed";
import type { ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { moveMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Mesh, Model, Part } from "../types";
import { mergeMeshes } from "../thermo/preview";
import type { MosaicGrid } from "./grid";
import { pieceSide, type BoardParams, type PieceCounts, type PieceParams } from "./params";
import { PUPIL, shapeOutline, type MosaicShape, type Pt } from "./shapes";

/*
 * Peças do mosaico (#206): chatas, sem suporte, com o chanfro na borda de cima (unha para tirar do tabuleiro) e um
 * chanfro mínimo embaixo contra o "pé de elefante", que faria a peça prender na casa. Cada peça nasce no centro da
 * casa; o olho é um disco branco com furo e a pupila preta, que enche o furo.
 */
const FOOT_CHAMFER = 0.2;
const PUPIL_PLAY = 0.05; // a pupila é um pouco menor que o furo: dá para imprimir separada e colar
const PLATE_MARGIN = 5;
const PIECE_GAP = 2.5;
const PLATE_GAP = 40;
const PLATES_PER_ROW = 4;

type K = <D extends { delete(): void }>(o: D) => D;

/** Anel de pontos do contorno encolhido `d` mm (formatos convexos: basta puxar para dentro pelo centro de cada aresta). */
function inset(M: ManifoldToplevel, k: K, pts: Pt[], d: number): Pt[] {
  if (d <= 0) return pts;
  const cs = k(new M.CrossSection([pts], "NonZero"));
  const out = k(cs.offset(-d, "Miter", 2)).toPolygons()[0];
  return out && out.length >= 3 ? (out as Pt[]) : pts;
}

/** Peça de um formato: prisma com chanfro embaixo e em cima (casco dos três anéis). */
function body(M: ManifoldToplevel, k: K, shape: MosaicShape, side: number, h: number, chamfer: number) {
  const outline = shapeOutline(shape, side, 24);
  const c = Math.min(chamfer, h / 2 - 0.1, side / 4);
  const ring = (pts: Pt[], z: number) => pts.map(([x, y]): [number, number, number] => [x, y, z]);
  const pts = [...ring(inset(M, k, outline, FOOT_CHAMFER), 0), ...ring(outline, FOOT_CHAMFER + 0.01), ...ring(outline, h - c), ...ring(inset(M, k, outline, c), h)];
  return k(M.Manifold.hull(pts));
}

export type PieceMeshes = { main: Mesh; pupil: Mesh | null };

/** Malhas de um formato na casa (centro na origem, base em z = 0). */
export function pieceMeshes(M: ManifoldToplevel, b: BoardParams, p: PieceParams, shape: MosaicShape): PieceMeshes {
  const side = pieceSide(b);
  return scoped((k) => {
    const solid = body(M, k, shape, side, p.height, p.chamfer);
    if (shape !== "eye") return { main: toMesh(solid), pupil: null };
    const hole = (side * PUPIL * 2) / 2;
    const pin = k(M.Manifold.cylinder(p.height, hole, hole, 32));
    const white = k(solid.subtract(pin));
    const pupil = k(M.Manifold.cylinder(p.height, hole - PUPIL_PLAY, hole - PUPIL_PLAY, 32));
    return { main: toMesh(white), pupil: toMesh(pupil) };
  });
}

export type MosaicColor = { key: string; label: string; hex: string };
export type PieceItem = { shape: MosaicShape; color: MosaicColor; n: number };

/** Lista de peças: cada cor ligada × cada formato com quantidade. O olho é sempre branco, com a quantidade própria. */
export function pieceList(colors: MosaicColor[], counts: PieceCounts, eyeColor: MosaicColor | null): PieceItem[] {
  const out: PieceItem[] = [];
  for (const c of colors)
    for (const shape of Object.keys(counts) as MosaicShape[]) if (shape !== "eye" && counts[shape] > 0) out.push({ shape, color: c, n: counts[shape] });
  if (eyeColor && counts.eye > 0) out.push({ shape: "eye", color: eyeColor, n: counts.eye });
  return out;
}

export type PlateLayout = "color" | "mixed";

/** Quantidades por formato que enchem uma mesa inteira de uma cor (metade de quadrados, o resto dividido). */
export function fullPlateCounts(capacity: number, eyes: number): PieceCounts {
  const part = (f: number) => Math.floor(capacity * f);
  const [square, quarter, triangle, half] = [part(0.5), part(0.16), part(0.12), part(0.1)];
  return { square, quarter, triangle, half, circle: capacity - square - quarter - triangle - half, eye: eyes };
}

/** Quantas peças cabem numa mesa. */
export function plateCapacity(b: BoardParams): { perRow: number; total: number } {
  const pitch = pieceSide(b) + PIECE_GAP;
  const perRow = Math.max(1, Math.floor((bedMm() - 2 * PLATE_MARGIN + PIECE_GAP) / pitch));
  return { perRow, total: perRow * perRow };
}

type Slot = { shape: MosaicShape; color: MosaicColor };

/** Uma lista de peças soltas (já na ordem de impressão) → modelos, uma mesa cada, com as peças em grade. */
function plates(b: BoardParams, slots: Slot[], meshes: Map<MosaicShape, PieceMeshes>, pupil: MosaicColor, layout: PlateLayout): Model[] {
  const { perRow, total } = plateCapacity(b);
  const pitch = pieceSide(b) + PIECE_GAP;
  const models: Model[] = [];
  const perColor = new Map<string, number>();
  for (let start = 0; start < slots.length; start += total) {
    const chunk = slots.slice(start, start + total);
    const byColor = new Map<string, { color: MosaicColor; meshes: Mesh[]; pupils: Mesh[] }>();
    chunk.forEach((s, i) => {
      const r = Math.floor(i / perRow), c = i % perRow;
      const x = (c - (perRow - 1) / 2) * pitch, y = ((perRow - 1) / 2 - r) * pitch;
      const m = meshes.get(s.shape)!;
      const g = byColor.get(s.color.key) ?? { color: s.color, meshes: [], pupils: [] };
      g.meshes.push(moveMesh(m.main, x, y));
      if (m.pupil) g.pupils.push(moveMesh(m.pupil, x, y));
      byColor.set(s.color.key, g);
    });
    const parts: Part[] = [];
    for (const g of byColor.values()) {
      parts.push({ name: g.color.label, color: g.color.hex, mesh: mergeMeshes(g.meshes) });
      if (g.pupils.length) parts.push({ name: "Pupila", color: pupil.hex, mesh: mergeMeshes(g.pupils) });
    }
    const first = [...byColor.values()][0].color;
    const nth = layout === "color" ? (perColor.set(first.key, (perColor.get(first.key) ?? 0) + 1), perColor.get(first.key)!) : models.length + 1;
    models.push({ name: layout === "color" ? `${first.label} · mesa ${nth}` : `Mesa ${nth}`, parts });
  }
  return models;
}

export type PiecesOut = { models: Model[]; count: number; extra: number; platesN: number; warnings: string[] };

/**
 * Todas as peças em mesas. "color": cada mesa só tem uma cor (imprime uma cor por vez, sem AMS); "mixed": mesas com
 * várias cores (AMS). `fill` completa a última mesa de cada grupo com quadrados a mais, para ela sair cheia.
 */
export function buildPieces(M: ManifoldToplevel, b: BoardParams, p: PieceParams, items: PieceItem[], o: { layout: PlateLayout; fill: boolean; pupil: MosaicColor }): PiecesOut {
  const warnings: string[] = [];
  const live = items.filter((i) => i.n > 0);
  if (!live.length) return { models: [], count: 0, extra: 0, platesN: 0, warnings };
  const { total } = plateCapacity(b);
  const shapes = [...new Set(live.map((i) => i.shape))];
  const meshes = new Map(shapes.map((s) => [s, pieceMeshes(M, b, p, s)]));
  const toSlots = (list: PieceItem[]): Slot[] => list.flatMap((i) => Array.from({ length: i.n }, (): Slot => ({ shape: i.shape, color: i.color })));
  const colorsInOrder = [...new Map(live.map((i) => [i.color.key, i.color])).values()];
  let extra = 0;
  const groups: Slot[][] = o.layout === "color" ? colorsInOrder.map((c) => toSlots(live.filter((i) => i.color.key === c.key))) : [toSlots(live)];
  if (o.fill) {
    if (!meshes.has("square")) meshes.set("square", pieceMeshes(M, b, p, "square"));
    groups.forEach((g) => {
      const pad = (total - (g.length % total)) % total;
      const lastColor = g[g.length - 1].color;
      for (let i = 0; i < pad; i++) g.push({ shape: "square", color: lastColor });
      extra += pad;
    });
  }
  const models = groups.flatMap((g) => plates(b, g, meshes, o.pupil, o.layout));
  // as mesas em grade, na ordem, com folga: o arquivo sai com tudo, o fatiador separa em mesas
  const step = bedMm() + PLATE_GAP;
  const placed = models.map((m, i) => ({ ...m, parts: m.parts.map((pt) => ({ ...pt, mesh: moveMesh(pt.mesh, (i % PLATES_PER_ROW) * step, -Math.floor(i / PLATES_PER_ROW) * step) })) }));
  const count = groups.reduce((n, g) => n + g.length, 0) - extra;
  if (placed.length > 1) warnings.push(`São ${placed.length} mesas de peças. O arquivo traz uma ao lado da outra (em grade): no fatiador, use "Organizar" para distribuir em mesas ou imprima uma de cada vez.`);
  return { models: placed, count, extra, platesN: placed.length, warnings };
}

/** Malha girada `rot` × 90° em volta do eixo z (a origem é o centro da casa). */
export function turnMesh(m: Mesh, rot: number): Mesh {
  const q = ((Math.round(rot) % 4) + 4) % 4;
  if (q === 0) return m;
  const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][q];
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    const [x, y] = [p[i], p[i + 1]];
    p[i] = x * c - y * s;
    p[i + 1] = x * s + y * c;
  }
  return { positions: p, indices: m.indices };
}

/** Onde a casa (c, r) de um desenho cai no tabuleiro: o desenho fica centrado na grade. */
export const cellOnBoard = (b: BoardParams, gridCols: number, gridRows: number, c: number, r: number): { col: number; row: number } | null => {
  const col = c + Math.floor((b.cols - gridCols) / 2), row = r + Math.floor((b.rows - gridRows) / 2);
  return col < 0 || row < 0 || col >= b.cols || row >= b.rows ? null : { col, row };
};

/** O desenho montado no tabuleiro: as peças nas casas, só para a prévia. Devolve também quantas casas ficaram fora do tabuleiro. */
export function assembledPreview(M: ManifoldToplevel, b: BoardParams, p: PieceParams, g: MosaicGrid, colors: MosaicColor[], pupil: MosaicColor): { model: Model | null; outside: number } {
  const byKey = new Map(colors.map((c) => [c.key, c]));
  const shapes = [...new Set(g.cells.flatMap((c) => (c ? [c.shape] : [])))];
  const meshes = new Map(shapes.map((s) => [s, pieceMeshes(M, b, p, s)]));
  const groups = new Map<string, { color: MosaicColor; list: Mesh[] }>();
  const pupils: Mesh[] = [];
  let outside = 0;
  g.cells.forEach((cell, i) => {
    if (!cell) return;
    const at = cellOnBoard(b, g.cols, g.rows, i % g.cols, Math.floor(i / g.cols));
    if (!at) return void outside++;
    const color = byKey.get(cell.shape === "eye" ? "white" : cell.color);
    if (!color) return;
    const x = (at.col - (b.cols - 1) / 2) * b.cell, y = ((b.rows - 1) / 2 - at.row) * b.cell;
    const m = meshes.get(cell.shape)!;
    const grp = groups.get(color.key) ?? { color, list: [] };
    grp.list.push(moveMesh(turnMesh(m.main, cell.rot), x, y, b.floor));
    groups.set(color.key, grp);
    if (m.pupil) pupils.push(moveMesh(m.pupil, x, y, b.floor));
  });
  const parts: Part[] = [...groups.values()].map((g2) => ({ name: g2.color.label, color: g2.color.hex, mesh: mergeMeshes(g2.list) }));
  if (pupils.length) parts.push({ name: "Pupila", color: pupil.hex, mesh: mergeMeshes(pupils) });
  return { model: parts.length ? { name: "Desenho montado", parts, previewOnly: true } : null, outside };
}
