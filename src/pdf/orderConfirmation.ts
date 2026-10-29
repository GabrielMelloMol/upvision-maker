import type { Company, Customer } from "../domain/customers";
import { customCopies, paymentOf, PAYMENT_LABEL, type Order } from "../domain/orders";
import { dateBr, moneyBr, Pdf, type PdfFonts } from "./doc";
import { bandFooter, bandHeader, heading } from "./header";
import { customerBlock } from "./quote";
import { factsRow, itemsTable, pixBox, totalsBlock } from "./orderParts";

/**
 * Confirmação de pedido em A4 (#185), o documento que o cliente recebe ao fechar a venda: itens (com a personalização),
 * total, forma de pagamento, quanto já foi pago (#177), prazo de entrega e o QR Pix só do que ainda falta pagar.
 */
export async function orderConfirmationPdf(fonts: PdfFonts, company: Company, order: Order, customer?: Customer | null): Promise<{ bytes: Uint8Array; trace: string[]; pixError: string | null }> {
  const pdf = await Pdf.create(fonts, `Confirmação do pedido ${order.id} - ${order.customerName}`);
  await bandHeader(pdf, company, "Confirmação de pedido", `Pedido nº ${order.id}`, [`Feito em ${dateBr(order.createdAt)}`, ...(order.dueDate ? [`Entrega até ${dateBr(order.dueDate)}`] : [])]);
  customerBlock(pdf, "Cliente", order.customerName, customer);

  itemsTable(pdf, order.items, (i) => {
    const copies = customCopies(i.custom);
    return copies.length ? `Personalização: ${copies.join(", ")}` : "";
  });
  const totals = totalsBlock(pdf, order.items, order.freight, order.paymentMethod && ["Forma de pagamento", order.paymentMethod]);

  const pay = paymentOf(order);
  factsRow(pdf, [order.dueDate && ["Prazo de entrega", dateBr(order.dueDate)]]);
  factsRow(pdf, [["Situação do pagamento", PAYMENT_LABEL[pay.state]], pay.paid > 0 && ["Já recebido", moneyBr(pay.paid)]]);
  if (pay.due > 0) pdf.text(`Falta pagar: ${moneyBr(pay.due)}`, { size: 12, font: "bold" });
  else if (totals.total > 0) pdf.text("Pagamento em dia. Obrigado!", { size: 10.5, font: "semibold", color: pdf.accent });

  if (order.notes) {
    pdf.gap(10);
    heading(pdf, "Observações");
    pdf.text(order.notes, { size: 10 });
  }

  const pixError = pixBox(pdf, company, pay.due, `PED${order.id}`);
  const footer = bandFooter(company);
  return { bytes: await pdf.save(footer.line, { name: footer.name, ref: `Pedido ${order.id}` }), trace: pdf.trace, pixError };
}
