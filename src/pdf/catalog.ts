import type { Company } from "../domain/customers";
import { A4, COLOR, MARGIN, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";

export type CatalogItem = { name: string; price: number; photo?: string; sku?: string };
const COLS = 3;
const ROWS = 4;
export const PER_PAGE = COLS * ROWS;

/** Catálogo de vitrine: 12 produtos por A4 (foto, nome e preço), para mandar no WhatsApp. */
export async function catalogPdf(fonts: PdfFonts, company: Company, items: CatalogItem[], title = "Catálogo"): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const pdf = await Pdf.create(fonts, `${title} - ${company.tradeName || company.name}`);
  await companyHeader(pdf, company, title, [`${items.length} produtos`]);
  const gap = 10;
  const cellW = (pdf.width - gap * (COLS - 1)) / COLS;
  let top = pdf.y;
  const cellH = (top - MARGIN - 24 - gap * (ROWS - 1)) / ROWS;
  for (let i = 0; i < items.length; i++) {
    const slot = i % PER_PAGE;
    if (i > 0 && slot === 0) {
      pdf.addPage();
      top = A4.h - MARGIN;
    }
    const r = Math.floor(slot / COLS);
    const c = slot % COLS;
    const x = MARGIN + c * (cellW + gap);
    const yTop = top - r * (cellH + gap);
    const it = items[i];
    pdf.page.drawRectangle({ x, y: yTop - cellH, width: cellW, height: cellH, borderColor: COLOR.line, borderWidth: 0.8, color: COLOR.white });
    const photoH = cellH - 46;
    if (it.photo) {
      try {
        pdf.drawContain(await pdf.image(it.photo), x + 6, yTop - 6 - photoH, cellW - 12, photoH);
      } catch {
        // foto inválida: fica o espaço vazio
      }
    } else pdf.page.drawRectangle({ x: x + 6, y: yTop - 6 - photoH, width: cellW - 12, height: photoH, color: COLOR.soft });
    const name = pdf.wrap(it.name, 9.5, pdf.fonts.semibold, cellW - 12).slice(0, 2);
    name.forEach((l, k) => pdf.at(l, x + 6, yTop - photoH - 20 - k * 11, { size: 9.5, font: "semibold" }));
    pdf.at(moneyBr(it.price), x + cellW - 6, yTop - cellH + 8, { size: 11, font: "bold", color: COLOR.accent, align: "right" });
  }
  const contact = [company.phone, company.instagram && `@${company.instagram.replace(/^@/, "")}`].filter(Boolean).join(" · ");
  return { bytes: await pdf.save(contact || company.tradeName || company.name), trace: pdf.trace };
}
