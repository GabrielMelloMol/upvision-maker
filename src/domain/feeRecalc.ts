import { round2 } from "./format";
import { lineTotal, orderFees, type Order } from "./orders";
import type { Settings } from "./settings";

/** `sales` = o valor vendido dos itens (sem frete); `fees` = as taxas e o imposto sobre ele, por unidade. */
export type FeeFix = { id: number; customerName: string; channel: string; sales: number; fees: number };

/**
 * Pedidos entregues que ficaram sem taxa do canal (#246: pedidos de antes da taxa ser gravada no pedido) e quanto
 * seria, pelas regras de hoje do canal. Pedido que já tem taxa não entra: o que foi gravado no dia da venda vale.
 */
export function feesToRecalc(orders: Order[], settings: Settings): FeeFix[] {
  return orders
    .filter((o) => o.status === "delivered" && (o.fees ?? 0) === 0)
    .map((o) => ({ id: o.id, customerName: o.customerName, channel: o.channel, sales: round2(o.items.reduce((t, i) => t + lineTotal(i), 0)), fees: orderFees(o.items, o.channel, settings) }))
    .filter((f) => f.fees > 0);
}

export const totalFees = (fixes: FeeFix[]) => round2(fixes.reduce((t, f) => t + f.fees, 0));

export const totalSales = (fixes: FeeFix[]) => round2(fixes.reduce((t, f) => t + f.sales, 0));

/** Taxas por canal: quantos pedidos, quanto foi vendido neles e quanto as taxas custam (para o quadro não confundir os dois valores). */
export function byChannel(fixes: FeeFix[]): { channel: string; orders: number; sales: number; fees: number }[] {
  const map = new Map<string, { channel: string; orders: number; sales: number; fees: number }>();
  for (const f of fixes) {
    const cur = map.get(f.channel) ?? { channel: f.channel, orders: 0, sales: 0, fees: 0 };
    map.set(f.channel, { channel: f.channel, orders: cur.orders + 1, sales: round2(cur.sales + f.sales), fees: round2(cur.fees + f.fees) });
  }
  return [...map.values()];
}
