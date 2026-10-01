import type { Company, Customer } from "../domain/customers";
import { lineTotal, orderTotals } from "../domain/orders";
import { pixPayload } from "../domain/pix";
import { qrMatrix } from "../domain/qr";
import { quoteNumber, type Quote } from "../domain/quotes";
import { A4, COLOR, dateBr, MARGIN, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";

const QR_SIZE = 110;
const QR_PAD = 10; // mesma margem nos 4 lados do QR dentro do quadro
const BOX_RADIUS = 8;

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

  await photoStrip(pdf, q, photos);

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

  // prazo e pagamento lado a lado, no mesmo formato de rótulo + valor
  const facts = [q.dueDate && ["Prazo de entrega", dateBr(q.dueDate)], q.paymentMethod && ["Pagamento", q.paymentMethod]].filter(Boolean) as [string, string][];
  if (facts.length) {
    pdf.ensure(30);
    facts.forEach(([label, value], i) => {
      const x = MARGIN + i * (pdf.width / 2);
      pdf.at(label, x, pdf.y - 9, { size: 8.5, font: "semibold", color: COLOR.muted });
      pdf.at(value, x, pdf.y - 23, { size: 9.5 });
    });
    pdf.gap(30);
  }
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
      pdf.ensure(QR_SIZE + 2 * QR_PAD);
      const top = pdf.y;
      pdf.roundRect(MARGIN, top, pdf.width, QR_SIZE + 2 * QR_PAD, BOX_RADIUS, COLOR.soft);
      pdf.qr(qrMatrix(payload), MARGIN + QR_PAD, top - QR_PAD - QR_SIZE, QR_SIZE);
      pdf.y = top - QR_PAD;
      const x = MARGIN + QR_SIZE + 2 * QR_PAD + 6;
      pdf.text(`Pague com Pix: ${moneyBr(t.total)}`, { x, size: 12, font: "bold" });
      pdf.text("Abra o app do banco, escolha Pix › Ler QR code. Ou use o Pix copia e cola:", { x, size: 8.5, color: COLOR.muted });
      pdf.text(payload, { x, size: 7, color: COLOR.muted });
      pdf.y = top - QR_SIZE - 2 * QR_PAD - 6;
    } catch (e) {
      pixError = e instanceof Error ? e.message : String(e);
    }
  }
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
