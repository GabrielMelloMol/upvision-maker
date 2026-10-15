import type { MosaicGrid } from "./grid";
import type { MosaicColor } from "./pieces";
import { placedOutline, PUPIL } from "./shapes";

/*
 * Desenho 2D do mosaico (#206) para a tela e para o PDF: cada casa vira um caminho SVG (Y para baixo, origem no canto
 * de cima à esquerda da grade). `pitch` é a distância entre os centros das casas; `size` é o lado da peça dentro dela.
 */
export type DrawnCell = { col: number; row: number; color: MosaicColor; d: string; pupil: { cx: number; cy: number; r: number } | null };

const f = (n: number) => String(Math.round(n * 100) / 100);

export function drawCells(g: MosaicGrid, colors: MosaicColor[], pitch: number, size: number): DrawnCell[] {
  const byKey = new Map(colors.map((c) => [c.key, c]));
  const out: DrawnCell[] = [];
  g.cells.forEach((cell, i) => {
    if (!cell) return;
    const color = byKey.get(cell.shape === "eye" ? "white" : cell.color);
    if (!color) return;
    const col = i % g.cols, row = Math.floor(i / g.cols);
    const cx = (col + 0.5) * pitch, cy = (row + 0.5) * pitch;
    const pts = placedOutline(cell.shape, cell.rot, size, cx, 0, 16).map(([x, y]) => [x, cy - y]);
    const d = `M ${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L ")} Z`;
    out.push({ col, row, color, d, pupil: cell.shape === "eye" ? { cx, cy, r: size * PUPIL } : null });
  });
  return out;
}

/** Caminho de uma casa vazia (o quadrado da casa rebaixada), para a quadrícula de fundo. */
export const pocketPath = (col: number, row: number, pitch: number, pocket: number) => {
  const x = (col + 0.5) * pitch - pocket / 2, y = (row + 0.5) * pitch - pocket / 2;
  return `M ${f(x)} ${f(y)} h ${f(pocket)} v ${f(pocket)} h ${f(-pocket)} Z`;
};
