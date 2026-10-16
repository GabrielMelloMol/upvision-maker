import { describe, expect, test } from "vitest";
import { feesToRecalc, totalFees } from "./feeRecalc";
import { SHOPEE_2026 } from "./channelDefaults";
import type { Order } from "./orders";
import { DEFAULT_SETTINGS } from "./settings";

const order = (over: Partial<Order>): Order =>
  ({ id: 1, customerId: null, customerName: "Ana", channel: "Shopee", dueDate: null, paymentMethod: "", notes: "", freight: 0, fees: 0, status: "delivered", stockApplied: true, appliedPlan: null, createdAt: "2026-01-02", deliveredAt: "2026-01-05", quoteId: null, paidAmount: 0, items: [{ id: 1, productId: null, description: "Chaveiro", qty: 2, unitPrice: 30, discountPct: 0, unitCost: 8, printMinutes: 0, custom: "" }], ...over }) as Order;
const settings = { ...DEFAULT_SETTINGS, taxPct: 4, channels: [SHOPEE_2026] };

describe("recalcular taxas dos pedidos antigos (#246)", () => {
  test("pedido entregue sem taxa entra, com a taxa de hoje do canal por unidade", () => {
    const [fix] = feesToRecalc([order({})], settings);
    // 2 un. de R$ 30: 20% (6) + R$ 4,50 + 4% (1,20) = 11,70 por unidade
    expect(fix.fees).toBe(23.4);
    expect(fix.channel).toBe("Shopee");
  });

  test("pedido que já tem taxa, pendente ou cancelado não entra", () => {
    expect(feesToRecalc([order({ id: 1, fees: 5 }), order({ id: 2, status: "pending" }), order({ id: 3, status: "canceled" })], settings)).toEqual([]);
  });

  test("venda direta (sem canal cadastrado) só paga o imposto; sem imposto não há o que recalcular", () => {
    expect(feesToRecalc([order({ channel: "WhatsApp" })], settings)[0].fees).toBe(2.4); // 4% de R$ 60
    expect(feesToRecalc([order({ channel: "WhatsApp" })], { ...settings, taxPct: 0 })).toEqual([]);
  });

  test("total soma os pedidos", () => {
    expect(totalFees(feesToRecalc([order({ id: 1 }), order({ id: 2 })], settings))).toBe(46.8);
  });
});
