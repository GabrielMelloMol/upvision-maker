import { z } from "zod";
import { OrderInput, todayIso } from "./orders";

export const QuoteInput = OrderInput.extend({
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  terms: z.string().trim().max(2000),
});
export type QuoteInput = z.infer<typeof QuoteInput>;
export type Quote = QuoteInput & { id: number; createdAt: string; convertedOrderId: number | null };

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
