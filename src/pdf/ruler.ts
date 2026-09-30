import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { A4, mm, type PdfFonts } from "./doc";

/*
 * Régua para imprimir em papel (#140): A4 em escala 1:1 com uma régua de 25 cm e outra de 20 cm, o contorno de um
 * cartão de crédito (85,6 × 54 mm, ISO/IEC 7810 ID-1) para conferir a escala, e o aviso de imprimir em 100%.
 */
export type Tick = { mm: number; kind: "cm" | "half" | "mm"; label?: string };

export function rulerTicks(lengthMm: number): Tick[] {
  return Array.from({ length: lengthMm + 1 }, (_, i) => (i % 10 === 0 ? { mm: i, kind: "cm" as const, label: String(i / 10) } : { mm: i, kind: i % 5 === 0 ? ("half" as const) : ("mm" as const) }));
}

const CARD = { w: 85.6, h: 54, r: 3.18 };
const TICK = { cm: mm(8), half: mm(5.5), mm: mm(3.5) };
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.4, 0.4, 0.45);
const LINE = 0.35; // pt: fino o bastante para ler 1 mm

/** Régua vertical com o zero embaixo, borda em x, marcas para a direita. */
function drawRuler(page: PDFPage, font: PDFFont, x: number, y0: number, lengthMm: number, title: string, trace: string[]) {
  const len = mm(lengthMm);
  // a borda de baixo é o zero (encosta no canto); em cima sobra espaço para o último número
  page.drawRectangle({ x, y: y0, width: mm(18), height: len + mm(4), borderColor: MUTED, borderWidth: 0.5 });
  page.drawLine({ start: { x, y: y0 }, end: { x, y: y0 + len }, thickness: LINE, color: INK });
  for (const t of rulerTicks(lengthMm)) {
    const y = y0 + mm(t.mm);
    page.drawLine({ start: { x, y }, end: { x: x + TICK[t.kind], y }, thickness: LINE, color: INK });
    if (t.label) page.drawText(t.label, { x: x + TICK.cm + mm(1), y: t.mm === 0 ? y + mm(1) : y - 3, size: 8, font, color: INK });
  }
  page.drawText(title, { x: x + mm(1), y: y0 + len + mm(6), size: 8, font, color: MUTED });
  trace.push(`ruler:${len.toFixed(2)}`, title);
}

export async function rulerPdf(fonts: PdfFonts): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Régua 1:1 para medir a gaveta");
  doc.setProducer("UpVision Maker");
  doc.setCreator("UpVision Maker");
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const page = doc.addPage([A4.w, A4.h]);
  const trace: string[] = [];
  const text = (s: string, x: number, y: number, size = 9, f = regular) => {
    page.drawText(s, { x, y, size, font: f, color: INK, maxWidth: A4.w - x - mm(12), lineHeight: size * 1.3 });
    trace.push(s);
  };
  // réguas coladas à esquerda (a 25 cm cabe na altura do A4 com margem de impressão)
  const y0 = mm(20);
  drawRuler(page, regular, mm(14), y0, 250, "25 cm", trace);
  drawRuler(page, regular, mm(40), y0, 200, "20 cm", trace);
  // instruções e checagem à direita
  const tx = mm(68);
  let ty = A4.h - mm(22);
  text("Régua para medir a gaveta", tx, ty, 14, bold);
  ty -= mm(9);
  for (const line of [
    "Imprima em tamanho real (100%, \"Tamanho real\"), sem \"Ajustar à página\".",
    "Recorte pela borda cinza e encoste o zero no canto da gaveta.",
    "Antes de usar, confira a escala nos dois testes abaixo.",
  ]) {
    text(line, tx, ty);
    ty -= mm(6);
  }
  // cartão de crédito em tamanho real
  ty -= mm(8);
  text("1. Um cartão de crédito deve cobrir este retângulo exatamente:", tx, ty, 9, bold);
  const cw = mm(CARD.w), ch = mm(CARD.h);
  const cy = ty - mm(6) - ch;
  page.drawRectangle({ x: tx, y: cy, width: cw, height: ch, borderColor: INK, borderWidth: LINE });
  page.drawText("85,6 × 54 mm", { x: tx + mm(3), y: cy + mm(3), size: 8, font: regular, color: MUTED });
  trace.push(`card:${cw.toFixed(2)}x${ch.toFixed(2)}`);
  ty = cy - mm(12);
  text("2. Ou encoste a borda de outra folha A4 na régua de 25 cm:", tx, ty, 9, bold);
  ty -= mm(6);
  text("a largura da folha (210 mm) tem que bater com o 21.", tx, ty);
  ty -= mm(12);
  text("Se não bater, a impressora mudou a escala: imprima de novo em 100%.", tx, ty, 9, bold);
  ty -= mm(12);
  for (const line of [
    "Sem impressora? O app de medida do celular (Medida no iPhone, Measure no Android)",
    "serve para uma ideia, mas pode errar mais de 1 cm: confira com a peça de teste",
    "de encaixe antes de imprimir a base toda.",
  ]) {
    text(line, tx, ty, 8);
    ty -= mm(4.5);
  }
  return { bytes: await doc.save(), trace };
}
