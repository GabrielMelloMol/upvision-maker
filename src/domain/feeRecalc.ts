import { round2 } from "./format";
import { orderFees, type Order } from "./orders";
import type { Settings } from "./settings";

export type FeeFix = { id: number; customerName: string; channel: string; fees: number };

/**
 * Pedidos entregues que ficaram sem taxa do canal (#246: pedidos de antes da taxa ser gravada no pedido) e quanto
 * seria, pelas regras de hoje do canal. Pedido que já tem taxa não entra: o que foi gravado no dia da venda vale.
 */
export function feesToRecalc(orders: Order[], settings: Settings): FeeFix[] {
  return orders
    .filter((o) => o.status === "delivered" && (o.fees ?? 0) === 0)
    .map((o) => ({ id: o.id, customerName: o.customerName, channel: o.channel, fees: orderFees(o.items, o.channel, settings) }))
    .filter((f) => f.fees > 0);
}

export const totalFees = (fixes: FeeFix[]) => round2(fixes.reduce((t, f) => t + f.fees, 0));
