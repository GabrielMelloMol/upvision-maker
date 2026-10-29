import type { Company } from "../domain/customers";
import { lineTotal, orderTotals, type OrderItem } from "../domain/orders";
import { pixPayload } from "../domain/pix";
import { qrMatrix } from "../domain/qr";
import type { RGB } from "pdf-lib";
import { A4, COLOR, MARGIN, moneyBr, type Pdf } from "./doc";
import { label } from "./header";

const QR_SIZE = 110;
const QR_PAD = 10; // mesma margem nos 4 lados do QR dentro do quadro
const BOX_RADIUS = 8;

type Line = Pick<OrderItem, "description" | "qty" | "unitPrice" | "discountPct">;

const ROW_PAD = 10;
const NUM = 10.5;
const SUB = 9;

/**
 * Tabela de itens, igual no orçamento e na confirmação do pedido (#301, modelo da Bia): títulos em maiúsculas entre linhas,
 * nome do item em negrito e, embaixo em cinza, o resto da descrição (depois da 1ª linha) e a `note`. "Desc." só com desconto.
 */
export function itemsTable<T extends Line>(pdf: Pdf, items: T[], note?: (i: T) => string) {
  const right = A4.w - MARGIN;
  const cols: { title: string; w: number; value: (i: T) => string; center?: boolean; bold?: boolean }[] = [
    { title: "Qtd.", w: 50, value: (i) => i.qty.toLocaleString("pt-BR"), center: true },
    { title: "Unitário", w: 85, value: (i) => moneyBr(i.unitPrice) },
    ...(items.some((i) => i.discountPct) ? [{ title: "Desc.", w: 55, value: (i: T) => (i.discountPct ? `${i.discountPct.toLocaleString("pt-BR")}%` : "—") }] : []),
    { title: "Total", w: 90, value: (i) => moneyBr(lineTotal(i)), bold: true },
  ];
  const descW = pdf.width - cols.reduce((s, c) => s + c.w, 0) - 12;
  // borda direita de cada coluna numérica (a última encosta na margem)
  const edges = cols.map((_, k) => right - cols.slice(k + 1).reduce((s, c) => s + c.w, 0));
  const at = (k: number, text: string, y: number, o: { size: number; font?: "regular" | "semibold" | "bold"; color?: RGB }) =>
    cols[k].center ? pdf.at(text, edges[k] - cols[k].w / 2, y, { ...o, align: "center" }) : pdf.at(text, edges[k], y, { ...o, align: "right" });
  const head = () => {
    pdf.ensure(60);
    pdf.rule();
    label(pdf, "Produto", MARGIN, pdf.y - 18);
    cols.forEach((c, k) => at(k, c.title.toUpperCase(), pdf.y - 18, { size: 8, font: "semibold", color: COLOR.muted }));
    pdf.gap(28);
    pdf.rule();
  };
  head();
  for (const i of items) {
    const [first, ...rest] = i.description.split("\n");
    const title = pdf.wrap(first, NUM, pdf.fonts.semibold, descW);
    const sub = pdf.wrap([rest.join("\n"), note?.(i)].filter(Boolean).join("\n"), SUB, pdf.fonts.regular, descW).filter(Boolean);
    const h = 2 * ROW_PAD + 4 + title.length * NUM * 1.35 + (sub.length ? 4 + sub.length * SUB * 1.4 : 0);
    if (pdf.y - h < MARGIN + 24) {
      pdf.addPage();
      head();
    }
    const base = pdf.y - ROW_PAD - NUM - 2;
    title.forEach((l, k) => pdf.at(l, MARGIN, base - k * NUM * 1.35, { size: NUM, font: "semibold" }));
    sub.forEach((l, k) => pdf.at(l, MARGIN, base - title.length * NUM * 1.35 - 4 - k * SUB * 1.4, { size: SUB, color: COLOR.muted }));
    cols.forEach((c, k) => at(k, c.value(i), base, { size: NUM, font: c.bold ? "bold" : "regular" }));
    pdf.gap(h);
    pdf.rule();
  }
}

const TOTALS_W = 230;
const TOTAL_H = 40;

/** Subtotal, descontos e frete à direita e o total numa caixa na cor da marca; `left`: forma de pagamento ao lado (#301). */
export function totalsBlock(pdf: Pdf, items: Line[], freight: number, left?: [string, string] | false | "" | null) {
  const t = orderTotals(items, freight);
  const rows: [string, string][] = [["Subtotal", moneyBr(t.subtotal)], ...(t.discount > 0 ? [["Descontos", `− ${moneyBr(t.discount)}`] as [string, string]] : []), ...(t.freight > 0 ? [["Frete", moneyBr(t.freight)] as [string, string]] : [])];
  pdf.gap(14);
  pdf.ensure(rows.length * 20 + TOTAL_H + 10);
  const top = pdf.y;
  let leftBottom = top;
  if (left) {
    label(pdf, left[0], MARGIN, top - 9);
    pdf.y = top - 18;
    pdf.text(left[1], { x: MARGIN, width: pdf.width - TOTALS_W - 20, size: 12, font: "bold" });
    leftBottom = pdf.y;
  }
  const x = right() - TOTALS_W;
  let y = top;
  for (const [l, v] of rows) {
    pdf.at(l, x + 16, y - 11, { size: 10, color: COLOR.muted });
    pdf.at(v, right() - 14, y - 11, { size: 10, font: "bold", align: "right" });
    y -= 20;
  }
  y -= 8;
  pdf.page.drawRectangle({ x, y: y - TOTAL_H, width: TOTALS_W, height: TOTAL_H, color: pdf.accent });
  pdf.at("TOTAL", x + 16, y - 25, { size: 11, font: "bold", color: COLOR.white });
  pdf.at(moneyBr(t.total), right() - 14, y - 27, { size: 18, font: "bold", color: COLOR.white, align: "right" });
  pdf.y = Math.min(y - TOTAL_H, leftBottom) - 20;
  return t;
}

const right = () => A4.w - MARGIN;

/** Pares rótulo + valor lado a lado (prazo, pagamento…). */
export function factsRow(pdf: Pdf, facts: ([string, string] | false | null | "" | undefined)[]) {
  const shown = facts.filter(Boolean) as [string, string][];
  if (!shown.length) return;
  pdf.ensure(34);
  shown.forEach(([l, value], i) => {
    const x = MARGIN + i * (pdf.width / 2);
    label(pdf, l, x, pdf.y - 8);
    pdf.at(value, x, pdf.y - 24, { size: 10.5, font: "semibold" });
  });
  pdf.gap(36);
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
    pdf.text("Abra o app do banco, escolha Pix › Ler QR code. Ou use o Pix copia e cola:", { x, size: 9.5, color: COLOR.muted });
    pdf.text(payload, { x, size: 7, color: COLOR.muted });
    pdf.y = top - QR_SIZE - 2 * QR_PAD - 6;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
