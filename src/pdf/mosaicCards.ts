import { rgb } from "pdf-lib";
import { drawCells, pocketPath } from "../geometry/mosaic/draw";
import { colorsUsed, countCells, partsOf, type MosaicGrid } from "../geometry/mosaic/grid";
import type { MosaicColor } from "../geometry/mosaic/pieces";
import { SHAPE_LABEL } from "../geometry/mosaic/shapes";
import { COLOR, MARGIN, mm, Pdf, type PdfFonts } from "./doc";

/*
 * Cartões de inspiração do mosaico (#206): uma página por desenho, com o desenho em tamanho real (1:1 com o tabuleiro:
 * dá para pôr as peças em cima do cartão) e a lista de peças. Se o tabuleiro for maior que a folha, o desenho é
 * reduzido e a página diz a escala.
 */
export type MosaicCard = { name: string; grid: MosaicGrid };
export type CardGeometry = { /** passo da grade (mm) */ cell: number; /** lado da peça (mm) */ piece: number; /** lado da casa rebaixada (mm) */ pocket: number };

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const PAPER = hex("#f3ead4");
const LINE = hex("#cdbf98");

export async function mosaicCardsPdf(fonts: PdfFonts, cards: MosaicCard[], colors: MosaicColor[], geo: CardGeometry): Promise<{ bytes: Uint8Array; trace: string[] }> {
  if (!cards.length) throw new Error("Escolha pelo menos um desenho.");
  const pdf = await Pdf.create(fonts, "Cartões de inspiração do mosaico");
  cards.forEach((card, i) => {
    if (i > 0) pdf.addPage();
    drawCard(pdf, card, colors, geo);
  });
  return { bytes: await pdf.save("UpVision Maker · Mosaico"), trace: pdf.trace };
}

function drawCard(pdf: Pdf, card: MosaicCard, colors: MosaicColor[], geo: CardGeometry) {
  const g = card.grid;
  const naturalW = mm(g.cols * geo.cell);
  const scale = Math.min(1, pdf.width / naturalW);
  const k = mm(geo.cell) * scale;
  const [w, h] = [g.cols * k, g.rows * k];
  pdf.text(card.name, { size: 22, font: "bold" });
  pdf.text(scale < 1 ? `Reduzido a ${Math.round(scale * 100)}% (o tabuleiro é maior que a folha). Casa de ${fmt(geo.cell * scale)} mm.` : `Tamanho real (escala 1:1): cada casa tem ${fmt(geo.cell)} mm, como no tabuleiro. Ponha as peças direto sobre o cartão.`, { size: 10, color: COLOR.muted });
  pdf.trace.push(`scale:${scale.toFixed(4)}`);
  pdf.gap(10);
  const left = MARGIN + (pdf.width - w) / 2;
  const top = pdf.y;
  pdf.page.drawRectangle({ x: left - 4, y: top - h - 4, width: w + 8, height: h + 8, color: PAPER, borderColor: LINE, borderWidth: 0.6 });
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) pdf.page.drawSvgPath(pocketPath(c, r, k, mm(geo.pocket) * scale), { x: left, y: top, borderColor: LINE, borderWidth: 0.4 });
  for (const cell of drawCells(g, colors, k, mm(geo.piece) * scale)) {
    pdf.page.drawSvgPath(cell.d, { x: left, y: top, color: hex(cell.color.hex), borderWidth: 0 });
    if (cell.pupil) pdf.page.drawCircle({ x: left + cell.pupil.cx, y: top - cell.pupil.cy, size: cell.pupil.r, color: hex(colors.find((c) => c.key === "black")?.hex ?? "#1c1c1e") });
  }
  pdf.y = top - h - 22;
  const parts = partsOf(g, colors);
  pdf.text(`Peças deste desenho: ${countCells(g)} em ${colorsUsed(g, colors).length} cores`, { size: 12, font: "semibold" });
  pdf.gap(4);
  pdf.table(
    [{ title: "Cor", width: 150 }, { title: "Formato", width: 200 }, { title: "Quantidade", width: pdf.width - 350, align: "right" }],
    parts.map((p) => [p.color.label, p.shape === "eye" ? "Olho (com a pupila preta)" : SHAPE_LABEL[p.shape], String(p.n)]),
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
