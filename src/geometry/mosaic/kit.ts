import type { ManifoldToplevel } from "../manifold";
import type { Model } from "../types";
import { buildBoard } from "./board";
import { blankGrid, KIT_COLORS, partsOf, type MosaicGrid } from "./grid";
import { DEFAULT_BOARD, DEFAULT_COUNTS, DEFAULT_PIECE, DEFAULT_POT, type BoardParams, type PieceCounts, type PieceParams, type PotParams } from "./params";
import { buildPieces, pieceList, type MosaicColor, type PieceItem, type PiecesOut, type PlateLayout } from "./pieces";
import { buildPot, compartmentVolume, compartments } from "./pot";
import { shapeArea } from "./shapes";

/*
 * O kit de mosaico (#206) inteiro: tabuleiro, peças, pote com tampa e o desenho. A tela e a varredura de QA chamam
 * `buildKit`, então os dois geram exatamente a mesma geometria.
 */
export type KitColor = { on: boolean; hex: string };
export type PieceSource = "manual" | "design";

export type MosaicSettings = {
  board: BoardParams;
  piece: PieceParams;
  /** Cada cor do kit: ligada (entra nas peças e vira uma divisória do pote) e o filamento (hex). */
  kit: Record<string, KitColor>;
  counts: PieceCounts;
  /** Peças pela quantidade por cor, ou só as que o desenho pede (mais a sobra). */
  source: PieceSource;
  /** Sobra (%) sobre as peças do desenho, para o que some. */
  spare: number;
  layout: PlateLayout;
  fill: boolean;
  pot: PotParams;
  grid: MosaicGrid;
};

const ON_BY_DEFAULT = new Set(["red", "orange", "yellow", "green", "blue", "purple", "white", "black"]);
export const DEFAULT_SETTINGS: MosaicSettings = {
  board: DEFAULT_BOARD,
  piece: DEFAULT_PIECE,
  kit: Object.fromEntries(KIT_COLORS.map((c) => [c.key, { on: ON_BY_DEFAULT.has(c.key), hex: c.hex }])),
  counts: DEFAULT_COUNTS,
  source: "manual",
  spare: 10,
  layout: "color",
  fill: false,
  pot: DEFAULT_POT,
  grid: blankGrid(DEFAULT_BOARD.cols, DEFAULT_BOARD.rows),
};

/** As cores do kit com o filamento escolhido; `onlyOn` deixa só as ligadas. */
export function kitColors(s: MosaicSettings, onlyOn = false): MosaicColor[] {
  return KIT_COLORS.map((c) => ({ ...c, hex: s.kit[c.key]?.hex ?? c.hex })).filter((c) => !onlyOn || s.kit[c.key]?.on);
}

const color = (s: MosaicSettings, key: string) => kitColors(s).find((c) => c.key === key) ?? null;

/** Peças que serão impressas: pela quantidade por cor ou pelo desenho (com a sobra). */
export function pieceItemsOf(s: MosaicSettings): PieceItem[] {
  if (s.source === "design") return partsOf(s.grid, kitColors(s)).map((i) => ({ ...i, n: Math.ceil(i.n * (1 + s.spare / 100)) }));
  const white = kitColors(s, true).find((c) => c.key === "white") ?? null;
  return pieceList(kitColors(s, true), s.counts, white);
}

/** Quantas peças de cada cor (para o pote e o resumo). */
export const totalPieces = (items: PieceItem[]) => items.reduce((n, i) => n + i.n, 0);

/** Quantos tabuleiros (colunas × linhas) o desenho pede, com o tamanho do tabuleiro atual. */
export const boardsNeeded = (s: MosaicSettings): [number, number] => [Math.max(1, Math.ceil(s.grid.cols / s.board.cols)), Math.max(1, Math.ceil(s.grid.rows / s.board.rows))];

export type KitOut = {
  board: { model: Model; warnings: string[] };
  pieces: PiecesOut;
  pot: { models: Model[]; warnings: string[] };
  /** Divisórias do pote (uma por cor ligada, ou mais se a grade for retangular). */
  divisions: number;
  /** Quantas peças a divisória mais cheia vai guardar e quantas cabem nela (estimativa, empilhadas soltas). */
  fill: { need: number; room: number };
};

const LOOSE_PACKING = 0.45; // peças soltas de volta no pote: bem menos que 100% do volume

/** Tudo de uma vez: tabuleiro, peças e pote. */
export function buildKit(M: ManifoldToplevel, s: MosaicSettings): KitOut {
  const colors = kitColors(s, true);
  const items = pieceItemsOf(s);
  const black = color(s, "black") ?? { key: "black", label: "Preto", hex: "#1c1c1e" };
  const pieces = buildPieces(M, s.board, s.piece, items, { layout: s.layout, fill: s.fill, pupil: black });
  const divisions = compartments(s.pot, colors.length);
  const pot = buildPot(M, s.pot, colors.length);
  const side = s.board.cell - s.board.rib - 2 * s.board.clearance;
  const perColor = new Map<string, number>();
  for (const i of items) perColor.set(i.color.key, (perColor.get(i.color.key) ?? 0) + i.n * shapeArea(i.shape, side) * s.piece.height);
  const need = Math.max(0, ...perColor.values());
  return { board: buildBoard(M, s.board), pieces, pot, divisions, fill: { need, room: compartmentVolume(s.pot, colors.length) * LOOSE_PACKING } };
}

/** Aviso se as peças de uma cor não cabem na divisória do pote. */
export function potFillWarning(o: KitOut): string | null {
  return o.fill.need > o.fill.room ? "As peças da cor mais cheia não cabem na divisória do pote: aumente o pote (diâmetro ou altura) ou imprima menos peças dessa cor." : null;
}
