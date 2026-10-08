import type { Company, Customer } from "../domain/customers";
import { quoteNumber, type Quote } from "../domain/quotes";
import { COLOR, dateBr, MARGIN, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";
import { factsRow, itemsTable, pixBox, totalsBlock } from "./orderParts";

/** Orçamento em A4: itens, descontos, frete, total, validade, condições e QR Pix com o valor exato. */
/** `photos`: capa de cada produto (id → data URL, #162); os itens com produto e foto aparecem em "Fotos das peças". */
export async function quotePdf(fonts: PdfFonts, company: Company, q: Quote, customer?: Customer | null, photos: Record<number, string> = {}): Promise<{ bytes: Uint8Array; trace: string[]; pixError: string | null }> {
  const num = quoteNumber(q, company.quotePrefix);
  const pdf = await Pdf.create(fonts, `Orçamento ${num} - ${q.customerName}`);
  await companyHeader(pdf, company, "Orçamento", [`Nº ${num}`, `Emitido em ${dateBr(q.createdAt)}`, `Válido até ${dateBr(q.validUntil)}`]);

  pdf.text("Para", { size: 8.5, font: "semibold", color: COLOR.muted });
  pdf.text(q.customerName, { size: 12, font: "semibold" });
  const contact = customer ? [customer.phone, customer.email].filter(Boolean).join(" · ") : "";
  if (contact) pdf.text(contact, { size: 9, color: COLOR.muted });
  pdf.gap(10);

  itemsTable(pdf, q.items);

  await photoStrip(pdf, q, photos);

  const t = totalsBlock(pdf, q.items, q.freight);

  // prazo e pagamento lado a lado, no mesmo formato de rótulo + valor
  factsRow(pdf, [q.dueDate && ["Prazo de entrega", dateBr(q.dueDate)], q.paymentMethod && ["Pagamento", q.paymentMethod]]);
  if (q.notes) {
    pdf.gap(6);
    pdf.text("Observações", { size: 8.5, font: "semibold", color: COLOR.muted });
    pdf.text(q.notes, { size: 9.5 });
  }
  if (q.terms) {
    pdf.gap(6);
    pdf.text("Condições", { size: 8.5, font: "semibold", color: COLOR.muted });
    pdf.text(q.terms, { size: 9.5 });
  }

  const pixError = pixBox(pdf, company, t.total, `ORC${q.id}`);
  return { bytes: await pdf.save(`${company.tradeName || company.name} · orçamento ${num}`), trace: pdf.trace, pixError };
}

const THUMB = 92;
const THUMB_GAP = 10;

/** Fotos reais das peças do orçamento (#162): uma por produto com capa, numa faixa com o nome embaixo. */
async function photoStrip(pdf: Pdf, q: Quote, photos: Record<number, string>) {
  const seen = new Set<number>();
  const items = q.items.filter((i) => i.productId && photos[i.productId] && !seen.has(i.productId) && seen.add(i.productId));
  if (!items.length) return;
  const perRow = Math.max(1, Math.floor((pdf.width + THUMB_GAP) / (THUMB + THUMB_GAP)));
  pdf.gap(10);
  pdf.ensure(20);
  pdf.text("Fotos das peças", { size: 8.5, font: "semibold", color: COLOR.muted });
  for (let i = 0; i < items.length; i += perRow) {
    pdf.ensure(THUMB + 26);
    const top = pdf.y;
    for (const [k, it] of items.slice(i, i + perRow).entries()) {
      const x = MARGIN + k * (THUMB + THUMB_GAP);
      try {
        pdf.drawContain(await pdf.image(photos[it.productId!]), x, top - THUMB, THUMB, THUMB);
      } catch {
        pdf.page.drawRectangle({ x, y: top - THUMB, width: THUMB, height: THUMB, color: COLOR.soft }); // foto que o PDF não lê
      }
      const name = pdf.wrap(it.description, 8, pdf.fonts.regular, THUMB)[0] ?? "";
      pdf.at(name, x, top - THUMB - 11, { size: 8, color: COLOR.muted });
    }
    pdf.gap(THUMB + 18);
  }
}
