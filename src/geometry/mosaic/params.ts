import type { MosaicShape } from "./shapes";

/*
 * Mosaico (#206): medidas do tabuleiro, das peças e do pote. Tudo em mm.
 * A peça quadrada mede `pieceSide` = casa − parede − 2 folgas: cabe na casa rebaixada sem prender.
 */
export type JoinKind = "none" | "dovetail";

export type BoardParams = {
  cols: number;
  rows: number;
  /** Passo da grade: distância entre os centros de duas casas. */
  cell: number;
  /** Parede entre duas casas. */
  rib: number;
  /** Folga de cada lado da peça dentro da casa. */
  clearance: number;
  /** Espessura do fundo da casa. */
  floor: number;
  /** Profundidade da casa rebaixada. */
  depth: number;
  /** Borda em volta da grade. */
  border: number;
  corner: number;
  join: JoinKind;
  color: string;
};

export const DEFAULT_BOARD: BoardParams = { cols: 8, rows: 8, cell: 20, rib: 1.6, clearance: 0.25, floor: 1.2, depth: 2.4, border: 6, corner: 3, join: "none", color: "#e8d8b4" };

export type PieceParams = {
  /** Altura da peça; passa da casa em `height − depth` para dar pegada. */
  height: number;
  /** Chanfro da borda de cima: dá onde enfiar a unha para tirar a peça do tabuleiro. */
  chamfer: number;
};
export const DEFAULT_PIECE: PieceParams = { height: 3.2, chamfer: 0.7 };

/** Quantas peças de cada formato, por cor. O olho é branco com pupila preta e só tem a quantidade dele. */
export type PieceCounts = Record<MosaicShape, number>;
export const DEFAULT_COUNTS: PieceCounts = { square: 40, half: 10, quarter: 12, triangle: 10, circle: 12, eye: 12 };

export type PotShape = "round" | "rect";
export type PotParams = {
  shape: PotShape;
  /** Diâmetro (redondo) ou largura (retangular). */
  w: number;
  /** Profundidade, só no retangular. */
  d: number;
  height: number;
  wall: number;
  floor: number;
  lid: boolean;
  lidClearance: number;
  color: string;
  lidColor: string;
};
export const DEFAULT_POT: PotParams = { shape: "round", w: 200, d: 130, height: 50, wall: 1.6, floor: 1.6, lid: true, lidClearance: 0.3, color: "#3b82f6", lidColor: "#3b82f6" };

/** Lado da peça quadrada. */
export const pieceSide = (b: BoardParams) => b.cell - b.rib - 2 * b.clearance;
/** Lado da casa rebaixada. */
export const pocketSide = (b: BoardParams) => b.cell - b.rib;
/** Medidas externas do tabuleiro. */
export const boardSize = (b: BoardParams): [number, number] => [b.cols * b.cell + 2 * b.border - b.rib, b.rows * b.cell + 2 * b.border - b.rib];
