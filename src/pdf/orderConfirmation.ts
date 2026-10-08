import type { Company, Customer } from "../domain/customers";
import { customCopies, paymentOf, PAYMENT_LABEL, type Order } from "../domain/orders";
import { COLOR, dateBr, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";
import { factsRow, itemsTable, pixBox, totalsBlock } from "./orderParts";

/**
 * Confirmação de pedido em A4 (#185), o documento que o cliente recebe ao fechar a venda: itens (com a personalização),
 * total, forma de pagamento, quanto já foi pago (#177), prazo de entrega e o QR Pix só do que ainda falta pagar.
 */
export async function orderConfirmationPdf(fonts: PdfFonts, company: Company, order: Order, customer?: Customer | null): Promise<{ bytes: Uint8Array; trace: string[]; pixError: string | null }> {
  const pdf = await Pdf.create(fonts, `Confirmação do pedido ${order.id} - ${order.customerName}`);
  await companyHeader(pdf, company, "Confirmação de pedido", [`Pedido nº ${order.id}`, `Feito em ${dateBr(order.createdAt)}`, ...(order.dueDate ? [`Entrega até ${dateBr(order.dueDate)}`] : [])]);

  pdf.text("Cliente", { size: 8.5, font: "semibold", color: COLOR.muted });
  pdf.text(order.customerName, { size: 12, font: "semibold" });
  const contact = customer ? [customer.phone, customer.email].filter(Boolean).join(" · ") : "";
  if (contact) pdf.text(contact, { size: 9, color: COLOR.muted });
  pdf.gap(10);

  itemsTable(pdf, order.items, (i) => {
    const copies = customCopies(i.custom);
    return copies.length ? `Personalização: ${copies.join(", ")}` : "";
  });
  const totals = totalsBlock(pdf, order.items, order.freight);

  const pay = paymentOf(order);
  factsRow(pdf, [order.dueDate && ["Prazo de entrega", dateBr(order.dueDate)], order.paymentMethod && ["Forma de pagamento", order.paymentMethod]]);
  factsRow(pdf, [["Situação do pagamento", PAYMENT_LABEL[pay.state]], pay.paid > 0 && ["Já recebido", moneyBr(pay.paid)]]);
  if (pay.due > 0) pdf.text(`Falta pagar: ${moneyBr(pay.due)}`, { size: 12, font: "bold" });
  else if (totals.total > 0) pdf.text("Pagamento em dia. Obrigado!", { size: 10.5, font: "semibold", color: COLOR.accent });

  if (order.notes) {
    pdf.gap(6);
    pdf.text("Observações", { size: 8.5, font: "semibold", color: COLOR.muted });
    pdf.text(order.notes, { size: 9.5 });
  }

  const pixError = pixBox(pdf, company, pay.due, `PED${order.id}`);
  return { bytes: await pdf.save(`${company.tradeName || company.name} · pedido ${order.id}`), trace: pdf.trace, pixError };
}
