import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { qrMatrix } from "../domain/qr";
import { filamentQr } from "../domain/spoolQr";
import { A4, mm, type PdfFonts } from "./doc";

export type SpoolLabel = { id: number; title: string; subtitle: string; detail: string };
export type LabelLayout = "a4" | "roll";

const LABEL_W = mm(50);
const LABEL_H = mm(30);
const PAD = mm(2);
const QR_QUIET = 2; // etiqueta pequena: 2 módulos de margem clara bastam para a câmera
const COLS = 3;
const ROWS = 8;
const GUTTER = mm(5);

/** Desenha uma etiqueta 50×30 mm com o canto inferior esquerdo em (x, y). */
function drawLabel(page: PDFPage, f: Record<"regular" | "bold", PDFFont>, l: SpoolLabel, x: number, y: number, trace: string[]) {
  page.drawRectangle({ x, y, width: LABEL_W, height: LABEL_H, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
  const m = qrMatrix(filamentQr(l.id), "M");
  const size = LABEL_H - 2 * PAD;
  const n = m.length + 2 * QR_QUIET;
  const cell = size / n;
  m.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) page.drawRectangle({ x: x + PAD + (c + QR_QUIET) * cell, y: y + PAD + size - (r + QR_QUIET + 1) * cell, width: cell + 0.02, height: cell + 0.02, color: rgb(0, 0, 0) });
    }),
  );
  const tx = x + PAD + size + PAD;
  const tw = LABEL_W - (tx - x) - PAD;
  const fit = (s: string, font: PDFFont, size0: number) => {
    let s2 = s;
    while (s2.length > 1 && font.widthOfTextAtSize(s2, size0) > tw) s2 = s2.slice(0, -2) + "…";
    return s2;
  };
  const lines: [string, PDFFont, number][] = [
    [l.title, f.bold, 9],
    [l.subtitle, f.regular, 7.5],
    [l.detail, f.regular, 7.5],
    [`#${l.id}`, f.bold, 7.5],
  ];
  let ty = y + LABEL_H - PAD - 9;
  for (const [s, font, size0] of lines) {
    if (!s) continue;
    const t = fit(s, font, size0);
    page.drawText(t, { x: tx, y: ty, size: size0, font, color: rgb(0.07, 0.09, 0.15) });
    trace.push(t);
    ty -= size0 + 3;
  }
}

/**
 * Etiquetas de rolo com QR. "roll": uma página de 50×30 mm por etiqueta (etiquetadora térmica);
 * "a4": folha A4 com 3 × 8 etiquetas para papel adesivo (recorte nas bordas cinza).
 */
export async function spoolLabelsPdf(fonts: PdfFonts, labels: SpoolLabel[], layout: LabelLayout): Promise<{ bytes: Uint8Array; trace: string[] }> {
  if (!labels.length) throw new Error("Escolha pelo menos um filamento.");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Etiquetas de rolo");
  doc.setProducer("UpVision Maker");
  doc.setCreator("UpVision Maker");
  const f = { regular: await doc.embedFont(fonts.regular, { subset: true }), bold: await doc.embedFont(fonts.bold, { subset: true }) };
  const trace: string[] = [];
  if (layout === "roll") {
    for (const l of labels) drawLabel(doc.addPage([LABEL_W, LABEL_H]), f, l, 0, 0, trace);
  } else {
    const gridW = COLS * LABEL_W + (COLS - 1) * GUTTER;
    const gridH = ROWS * LABEL_H + (ROWS - 1) * GUTTER;
    const x0 = (A4.w - gridW) / 2;
    const y0 = (A4.h + gridH) / 2;
    let page: PDFPage | null = null;
    labels.forEach((l, i) => {
      const k = i % (COLS * ROWS);
      if (k === 0) page = doc.addPage([A4.w, A4.h]);
      const col = k % COLS, row = Math.floor(k / COLS);
      drawLabel(page!, f, l, x0 + col * (LABEL_W + GUTTER), y0 - (row + 1) * LABEL_H - row * GUTTER, trace);
    });
  }
  return { bytes: await doc.save(), trace };
}
