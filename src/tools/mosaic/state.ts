import type { CornerStyle } from "../../geometry/mosaic/grid";
import { DEFAULT_SETTINGS, type MosaicSettings } from "../../geometry/mosaic/kit";
import { pieceSide } from "../../geometry/mosaic/params";
import { inRange } from "../../ui/NumField";

/** Estado da ferramenta Mosaico (#206): as medidas do kit, o desenho e o que a tela escolheu para o PDF e a conversão. */
export type State = MosaicSettings & {
  designName: string;
  cardIds: string[];
  withMine: boolean;
  corners: CornerStyle;
  imageSize: number;
  dropBackground: boolean;
};

export const initialState = (): State => ({ ...DEFAULT_SETTINGS, designName: "", cardIds: [], withMine: true, corners: "quarter", imageSize: 8, dropBackground: true });

export type Tab = "board" | "pieces" | "pot" | "design" | "cards";

/** Faixas de cada campo; usadas pela tela para marcar o que está fora e por quem gera para não montar nada inválido. */
export function validState(s: State): boolean {
  const { board: b, piece: p, pot, counts } = s;
  return (
    Number.isInteger(b.cols) && Number.isInteger(b.rows) && inRange(b.cols, 2, 16) && inRange(b.rows, 2, 16) &&
    inRange(b.cell, 12, 40) && inRange(b.rib, 1, 3) && inRange(b.clearance, 0.1, 0.6) && inRange(b.floor, 0.8, 3) && inRange(b.depth, 1.2, 4) && inRange(b.border, 2, 15) &&
    pieceSide(b) >= 6 &&
    inRange(p.height, 2, 6) && inRange(p.chamfer, 0, 1.5) &&
    Object.values(counts).every((n) => Number.isInteger(n) && inRange(n, 0, 400)) && inRange(s.spare, 0, 100) &&
    inRange(pot.w, 80, 250) && inRange(pot.d, 60, 250) && inRange(pot.height, 20, 120) && inRange(pot.wall, 1.2, 3) && inRange(pot.floor, 1, 3) && inRange(pot.lidClearance, 0.1, 0.6)
  );
}
