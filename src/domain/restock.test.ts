import { describe, expect, test } from "vitest";
import type { Order } from "./orders";
import { EMPTY_PRODUCT, type Product } from "./products";
import { restockSuggestions, WINDOW_DAYS } from "./restock";

const TODAY = "2026-04-30";
const product = (p: Partial<Product> & { id: number }): Product => ({ ...EMPTY_PRODUCT, name: `P${p.id}`, ...p }) as Product;
const order = (id: number, status: Order["status"], productId: number, qty: number, deliveredAt: string | null = null): Order =>
  ({
    id, customerId: null, customerName: "Ana", channel: "Shopee", dueDate: null, paymentMethod: "Pix", notes: "", freight: 0, status,
    stockApplied: false, appliedPlan: null, createdAt: "2026-04-01 10:00:00", deliveredAt, quoteId: null, paidAmount: 0,
    items: [{ id, productId, description: `P${productId}`, qty, unitPrice: 10, discountPct: 0, unitCost: 4, printMinutes: 10, custom: "" }],
  }) as Order;

describe("reposição sugerida pelo ritmo de vendas (#215)", () => {
  test("ritmo × dias de cobertura menos o estoque, em mesas cheias", () => {
    // 30 vendidos em 30 dias = 1 por dia; cobertura de 14 dias = 14; estoque 4 → faltam 10; mesas de 6 → 2 mesas = 12 peças
    const out = restockSuggestions([order(1, "delivered", 1, 30, "2026-04-20")], [product({ id: 1, stock: 4, piecesPerPlate: 6 })], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sold: 30, target: 14, toPrint: 12, plates: 2, daysLeft: 4, reason: "ritmo", level: "warn" });
    expect(out[0].perDay).toBeCloseTo(1, 5);
  });

  test("a cobertura escolhida muda a sugestão (7, 14 ou 30 dias)", () => {
    const o = [order(1, "delivered", 1, 30, "2026-04-20")];
    const p = [product({ id: 1, stock: 0 })];
    expect(restockSuggestions(o, p, TODAY, 7)[0].toPrint).toBe(7);
    expect(restockSuggestions(o, p, TODAY, 14)[0].toPrint).toBe(14);
    expect(restockSuggestions(o, p, TODAY, 30)[0].toPrint).toBe(30);
  });

  test("estoque que cobre a cobertura: nada a imprimir", () => {
    const out = restockSuggestions([order(1, "delivered", 1, 30, "2026-04-20")], [product({ id: 1, stock: 20 })], TODAY);
    expect(out[0]).toMatchObject({ toPrint: 0, plates: 0, level: "ok", reason: null });
  });

  test("pedidos abertos entram na conta, e estoque menor que eles é crítico", () => {
    const out = restockSuggestions([order(1, "pending", 1, 8), order(2, "production", 1, 4)], [product({ id: 1, stock: 5 })], TODAY);
    expect(out[0]).toMatchObject({ committed: 12, target: 12, toPrint: 7, level: "critical", reason: "pedidos" });
  });

  test("pedidos já entregues ou cancelados não comprometem o estoque", () => {
    const out = restockSuggestions([order(1, "canceled", 1, 8), order(2, "delivered", 1, 2, "2026-01-01")], [product({ id: 1, stock: 0, minStock: 3 })], TODAY);
    expect(out[0]).toMatchObject({ committed: 0, sold: 0, target: 3, toPrint: 3, reason: "mínimo" });
  });

  test("vendas fora da janela de 30 dias não contam", () => {
    const old = order(1, "delivered", 1, 30, "2026-03-01");
    expect(restockSuggestions([old], [product({ id: 1, stock: 0 })], TODAY)).toEqual([]);
    expect(WINDOW_DAYS).toBe(30);
  });

  test("estoque que acaba em até 3 dias é crítico; mais que isso é atenção", () => {
    const o = [order(1, "delivered", 1, 30, "2026-04-20")]; // 1/dia
    expect(restockSuggestions(o, [product({ id: 1, stock: 3 })], TODAY)[0]).toMatchObject({ daysLeft: 3, level: "critical" });
    expect(restockSuggestions(o, [product({ id: 1, stock: 5 })], TODAY)[0]).toMatchObject({ daysLeft: 5, level: "warn" });
  });

  test("ordena do mais urgente ao menos; produto sem venda, pedido nem mínimo não aparece", () => {
    const o = [order(1, "delivered", 1, 30, "2026-04-20"), order(2, "delivered", 2, 60, "2026-04-21"), order(3, "delivered", 3, 30, "2026-04-22")];
    const ps = [product({ id: 1, stock: 10 }), product({ id: 2, stock: 1 }), product({ id: 3, stock: 100 }), product({ id: 4, stock: 0 })];
    expect(restockSuggestions(o, ps, TODAY).map((r) => r.product.id)).toEqual([2, 1, 3]); // 2 crítico, 1 atenção, 3 em dia; 4 sem sinal
  });

  test("peças por mesa arredondam para cima e mesa de 1 é o padrão", () => {
    const o = [order(1, "delivered", 1, 30, "2026-04-20")];
    expect(restockSuggestions(o, [product({ id: 1, stock: 13, piecesPerPlate: 4 })], TODAY)[0]).toMatchObject({ toPrint: 4, plates: 1 });
    expect(restockSuggestions(o, [product({ id: 1, stock: 13 })], TODAY)[0]).toMatchObject({ toPrint: 1, plates: 1 });
  });
});
