import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { LAYOUT, markerCenters } from "./photo";
import type { Sheet } from "./types";

const PT_PER_MM = 72 / 25.4;
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
/** Cinza claro o bastante para não ser confundido com ferramenta (fica acima do limiar de escuro). */
const GUIDE = rgb(0.8, 0.8, 0.8);

/**
 * PDF da folha de medição (#169), em pé: 4 marcadores nos cantos, título, régua de 100 mm para conferir a escala da
 * impressão e o tracejado da área das ferramentas. As medidas vêm de `LAYOUT`, as mesmas que a detecção usa.
 */
export async function measureSheetPdf(sheet: Sheet, name: string): Promise<Uint8Array> {
  const W = Math.min(sheet.widthMm, sheet.heightMm);
  const H = Math.max(sheet.widthMm, sheet.heightMm);
  const doc = await PDFDocument.create();
  doc.setTitle(`Folha de medição ${name}`);
  const page = doc.addPage([W * PT_PER_MM, H * PT_PER_MM]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // mm com y para baixo (como no LAYOUT) → pontos do PDF, com y para cima
  const rect = (x: number, y: number, w: number, h: number, color = BLACK) =>
    page.drawRectangle({ x: x * PT_PER_MM, y: (H - y - h) * PT_PER_MM, width: w * PT_PER_MM, height: h * PT_PER_MM, color });
  const text = (s: string, x: number, y: number, size: number, f = font) => {
    const width = f.widthOfTextAtSize(s, size) / PT_PER_MM;
    page.drawText(s, { x: (x - width / 2) * PT_PER_MM, y: (H - y) * PT_PER_MM, size, font: f, color: BLACK });
  };

  for (const [cx, cy] of markerCenters(sheet)) {
    const sq = (side: number, color = BLACK) => rect(cx - side / 2, cy - side / 2, side, side, color);
    sq(LAYOUT.marker);
    sq(LAYOUT.white, WHITE);
    sq(LAYOUT.dot);
  }

  text(`Folha de medição ${name} · UpVision Maker`, W / 2, 11, 10, bold);
  text("Ferramentas deitadas dentro do tracejado; fotografe de cima com os 4 quadrados à vista.", W / 2, 17, 7.5);

  // régua de 100 mm na faixa de baixo, na mesma altura dos marcadores
  const y = H - LAYOUT.inset;
  const x0 = (W - LAYOUT.ruler) / 2;
  rect(x0, y - 0.15, LAYOUT.ruler, 0.3);
  for (let mm = 0; mm <= LAYOUT.ruler; mm += 5) {
    const tall = mm % 10 === 0 ? 3 : 1.5;
    rect(x0 + mm - 0.15, y - tall, 0.3, tall);
    if (mm % 10 === 0) text(String(mm / 10), x0 + mm, y - 4, 6);
  }
  text("Imprima em tamanho real (100%, sem ajustar à página). Esta régua deve medir 100 mm (10 cm).", W / 2, y + 5, 7);

  // área das ferramentas: entre as duas faixas
  page.drawRectangle({
    x: 6 * PT_PER_MM,
    y: LAYOUT.band * PT_PER_MM,
    width: (W - 12) * PT_PER_MM,
    height: (H - 2 * LAYOUT.band) * PT_PER_MM,
    borderColor: GUIDE,
    borderWidth: 0.6,
    borderDashArray: [4, 4],
  });
  return doc.save();
}
