import type { Company, Customer } from "../domain/customers";
import { lineTotal, orderTotals } from "../domain/orders";
import { pixPayload } from "../domain/pix";
import { qrMatrix } from "../domain/qr";
import type { Quote } from "../domain/quotes";
import { A4, COLOR, dateBr, MARGIN, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";

const QR_SIZE = 110;

/** Orçamento em A4: itens, descontos, frete, total, validade, condições e QR Pix com o valor exato. */
export async function quotePdf(fonts: PdfFonts, company: Company, q: Quote, customer?: Customer | null): Promise<{ bytes: Uint8Array; trace: string[]; pixError: string | null }> {
  const pdf = await Pdf.create(fonts, `Orçamento ${q.id} - ${q.customerName}`);
  await companyHeader(pdf, company, "Orçamento", [`Nº ${String(q.id).padStart(4, "0")}`, `Emitido em ${dateBr(q.createdAt)}`, `Válido até ${dateBr(q.validUntil)}`]);

  pdf.text("Para", { size: 8.5, font: "semibold", color: COLOR.muted });
  pdf.text(q.customerName, { size: 12, font: "semibold" });
  const contact = customer ? [customer.phone, customer.email].filter(Boolean).join(" · ") : "";
  if (contact) pdf.text(contact, { size: 9, color: COLOR.muted });
  pdf.gap(10);

  const w = pdf.width;
  pdf.table(
    [
      { title: "Item", width: w - 250 },
      { title: "Qtd", width: 50, align: "right" },
      { title: "Unitário", width: 70, align: "right" },
      { title: "Desc.", width: 50, align: "right" },
      { title: "Total", width: 80, align: "right" },
    ],
    q.items.map((i) => [i.description, i.qty.toLocaleString("pt-BR"), moneyBr(i.unitPrice), i.discountPct ? `${i.discountPct.toLocaleString("pt-BR")}%` : "—", moneyBr(lineTotal(i))]),
  );

  const t = orderTotals(q.items, q.freight);
  pdf.gap(8);
  const totalsX = A4.w - MARGIN - 220;
  const row = (label: string, value: string, strong = false) => {
    pdf.ensure(18);
    pdf.at(label, totalsX, pdf.y - 11, { size: strong ? 12 : 9.5, font: strong ? "bold" : "regular", color: strong ? COLOR.text : COLOR.muted });
    pdf.at(value, A4.w - MARGIN, pdf.y - 11, { size: strong ? 12 : 9.5, font: strong ? "bold" : "semibold", align: "right" });
    pdf.gap(strong ? 20 : 15);
  };
  row("Subtotal", moneyBr(t.subtotal));
  if (t.discount > 0) row("Descontos", `− ${moneyBr(t.discount)}`);
  if (t.freight > 0) row("Frete", moneyBr(t.freight));
  row("Total", moneyBr(t.total), true);
  pdf.gap(6);

  if (q.dueDate) pdf.text(`Prazo de entrega: ${dateBr(q.dueDate)}`, { size: 9.5 });
  if (q.paymentMethod) pdf.text(`Pagamento: ${q.paymentMethod}`, { size: 9.5 });
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

  let pixError: string | null = null;
  if (company.pixKey && t.total > 0) {
    try {
      const payload = pixPayload({ key: company.pixKey, name: company.pixName || company.tradeName || company.name, city: company.pixCity || company.city, amount: t.total, txid: `ORC${q.id}` });
      pdf.gap(10);
      pdf.ensure(QR_SIZE + 10);
      const top = pdf.y;
      pdf.page.drawRectangle({ x: MARGIN, y: top - QR_SIZE - 12, width: pdf.width, height: QR_SIZE + 12, color: COLOR.soft });
      pdf.qr(qrMatrix(payload), MARGIN + 6, top - QR_SIZE - 6, QR_SIZE);
      pdf.y = top - 10;
      const x = MARGIN + QR_SIZE + 20;
      pdf.text(`Pague com Pix: ${moneyBr(t.total)}`, { x, size: 12, font: "bold" });
      pdf.text("Abra o app do banco, escolha Pix › Ler QR code. Ou use o Pix copia e cola:", { x, size: 8.5, color: COLOR.muted });
      pdf.text(payload, { x, size: 7, color: COLOR.muted });
      pdf.y = top - QR_SIZE - 16;
    } catch (e) {
      pixError = e instanceof Error ? e.message : String(e);
    }
  }
  return { bytes: await pdf.save(`${company.tradeName || company.name} · orçamento ${q.id}`), trace: pdf.trace, pixError };
}
