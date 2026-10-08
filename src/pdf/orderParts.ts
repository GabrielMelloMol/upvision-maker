import type { Company } from "../domain/customers";
import { lineTotal, orderTotals, type OrderItem } from "../domain/orders";
import { pixPayload } from "../domain/pix";
import { qrMatrix } from "../domain/qr";
import { A4, COLOR, MARGIN, moneyBr, type Pdf } from "./doc";

const QR_SIZE = 110;
const QR_PAD = 10; // mesma margem nos 4 lados do QR dentro do quadro
const BOX_RADIUS = 8;

type Line = Pick<OrderItem, "description" | "qty" | "unitPrice" | "discountPct">;

/** Tabela de itens (descrição, quantidade, unitário, desconto e total), igual no orçamento e na confirmação do pedido. */
export function itemsTable<T extends Line>(pdf: Pdf, items: T[], note?: (i: T) => string) {
  const w = pdf.width;
  pdf.table(
    [
      { title: "Item", width: w - 250 },
      { title: "Qtd", width: 50, align: "right" },
      { title: "Unitário", width: 70, align: "right" },
      { title: "Desc.", width: 50, align: "right" },
      { title: "Total", width: 80, align: "right" },
    ],
    items.map((i) => [[i.description, note?.(i)].filter(Boolean).join(" · "), i.qty.toLocaleString("pt-BR"), moneyBr(i.unitPrice), i.discountPct ? `${i.discountPct.toLocaleString("pt-BR")}%` : "—", moneyBr(lineTotal(i))]),
  );
}

/** Subtotal, descontos, frete e total, à direita. */
export function totalsBlock(pdf: Pdf, items: Line[], freight: number) {
  const t = orderTotals(items, freight);
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
  return t;
}

/** Pares rótulo + valor lado a lado (prazo, pagamento…). */
export function factsRow(pdf: Pdf, facts: ([string, string] | false | null | "" | undefined)[]) {
  const shown = facts.filter(Boolean) as [string, string][];
  if (!shown.length) return;
  pdf.ensure(30);
  shown.forEach(([label, value], i) => {
    const x = MARGIN + i * (pdf.width / 2);
    pdf.at(label, x, pdf.y - 9, { size: 8.5, font: "semibold", color: COLOR.muted });
    pdf.at(value, x, pdf.y - 23, { size: 9.5 });
  });
  pdf.gap(30);
}

/** Quadro "Pague com Pix" com o QR do valor exato. Devolve o motivo se a chave Pix não gerou o código, ou null. */
export function pixBox(pdf: Pdf, company: Company, amount: number, txid: string): string | null {
  if (!company.pixKey || amount <= 0) return null;
  try {
    const payload = pixPayload({ key: company.pixKey, name: company.pixName || company.tradeName || company.name, city: company.pixCity || company.city, amount, txid });
    pdf.gap(10);
    pdf.ensure(QR_SIZE + 2 * QR_PAD);
    const top = pdf.y;
    pdf.roundRect(MARGIN, top, pdf.width, QR_SIZE + 2 * QR_PAD, BOX_RADIUS, COLOR.soft);
    pdf.qr(qrMatrix(payload), MARGIN + QR_PAD, top - QR_PAD - QR_SIZE, QR_SIZE);
    pdf.y = top - QR_PAD;
    const x = MARGIN + QR_SIZE + 2 * QR_PAD + 6;
    pdf.text(`Pague com Pix: ${moneyBr(amount)}`, { x, size: 12, font: "bold" });
    pdf.text("Abra o app do banco, escolha Pix › Ler QR code. Ou use o Pix copia e cola:", { x, size: 8.5, color: COLOR.muted });
    pdf.text(payload, { x, size: 7, color: COLOR.muted });
    pdf.y = top - QR_SIZE - 2 * QR_PAD - 6;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
