import { z } from "zod";
import { round2 } from "./format";
import { CONSUMER, OrderInput, RESALE, todayIso, type OrderItem } from "./orders";
import { PRICE_NAMES } from "./pricing";

export const QuoteInput = OrderInput.extend({
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  terms: z.string().trim().max(2000),
});
export type QuoteInput = z.infer<typeof QuoteInput>;
/** year/seq: número do orçamento no ano (#36); null só em dado antigo que ainda não foi numerado. */
export type Quote = QuoteInput & { id: number; createdAt: string; convertedOrderId: number | null; year: number | null; seq: number | null; /** Texto do problema quando o orçamento gravado não se lê mais (M16): aparece na lista, só dá para excluir. */ unreadable?: string };

/** "ORC-2026-001"; sem número, "ORC-7" (o id). */
export const quoteNumber = (q: Pick<Quote, "id" | "year" | "seq">, prefix: string) =>
  q.year && q.seq ? `${prefix}-${q.year}-${String(q.seq).padStart(3, "0")}` : `${prefix}-${q.id}`;

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
};

export const isExpired = (q: Pick<Quote, "validUntil" | "convertedOrderId">, today = todayIso()) => !q.convertedOrderId && q.validUntil < today;

/** O pedido herda cliente, canal, itens, frete, prazo e observações; validade e condições ficam no orçamento. */
export function quoteToOrderInput(q: QuoteInput): OrderInput {
  const { validUntil: _v, terms: _t, ...order } = q;
  void _v;
  void _t;
  return OrderInput.parse(order);
}

/** Item avulso vindo da calculadora (#28): a mesa vira `pieces` unidades com custo e minutos de máquina por peça. */
export function itemFromCalc(c: { description: string; pieces: number; unitPrice: number; unitCost: number; printMinutes: number }): OrderItem {
  const qty = Math.max(1, Math.floor(c.pieces) || 1);
  return {
    productId: null,
    custom: "",
    description: c.description.trim() || "Peça impressa em 3D",
    qty,
    unitPrice: round2(c.unitPrice),
    discountPct: 0,
    unitCost: round2(c.unitCost),
    printMinutes: round2(c.printMinutes / qty),
  };
}

/** Linha da tabela de preços da calculadora → canal do pedido (os dois preços do multiplicador têm nome próprio no pedido). */
export const orderChannelOf = (priceName: string) =>
  priceName === PRICE_NAMES.consumer.name ? CONSUMER : priceName === PRICE_NAMES.resale.name ? RESALE : priceName;
