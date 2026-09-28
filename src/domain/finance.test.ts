import { describe, expect, test } from "vitest";
import { breakdown, costOccurrences, financeSummary, monthlySeries, monthsBetween, recommendedStock, stockHealth, type OperationalCost } from "./finance";
import type { Order } from "./orders";

const cost = (c: Partial<OperationalCost>): OperationalCost => ({ id: 1, description: "Aluguel", category: "Fixo", amount: 100, frequency: "monthly", startDate: "2026-01-10", endDate: null, printerId: null, notes: "", ...c });

describe("custos operacionais", () => {
  test("mensal conta uma vez por mês no dia de início; respeita data final (parcelas)", () => {
    expect(costOccurrences(cost({}), "2026-01-01", "2026-03-31")).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(costOccurrences(cost({ endDate: "2026-02-28" }), "2026-01-01", "2026-12-31")).toHaveLength(2);
    expect(costOccurrences(cost({}), "2025-01-01", "2025-12-31")).toEqual([]);
  });
  test("dia 31 cai no último dia dos meses curtos", () => {
    expect(costOccurrences(cost({ startDate: "2026-01-31" }), "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  test("semanal, anual e único", () => {
    expect(costOccurrences(cost({ frequency: "weekly", startDate: "2026-03-02" }), "2026-03-01", "2026-03-31")).toHaveLength(5);
    expect(costOccurrences(cost({ frequency: "yearly", startDate: "2024-06-01" }), "2026-01-01", "2026-12-31")).toEqual(["2026-06-01"]);
    expect(costOccurrences(cost({ frequency: "once", startDate: "2026-05-05" }), "2026-01-01", "2026-12-31")).toEqual(["2026-05-05"]);
  });
});

const order = (o: Partial<Order>): Order => ({
  id: 1,
  customerId: null,
  customerName: "Ana",
  channel: "Consumidor final",
  dueDate: null,
  paymentMethod: "Pix",
  notes: "",
  freight: 0,
  status: "delivered",
  stockApplied: true,
  appliedPlan: null,
  createdAt: "2026-03-01 10:00:00",
  deliveredAt: "2026-03-05",
  quoteId: null,
  items: [{ id: 1, productId: 1, description: "Chaveiro", qty: 10, unitPrice: 15, discountPct: 0, unitCost: 4, printMinutes: 12 }],
  ...o,
});

describe("resumo financeiro", () => {
  const orders = [
    order({}),
    order({ id: 2, channel: "Shopee", deliveredAt: "2026-04-02", freight: 10, items: [{ id: 2, productId: 2, description: "Topo de bolo", qty: 1, unitPrice: 50, discountPct: 10, unitCost: 8, printMinutes: 60 }] }),
    order({ id: 3, status: "production", deliveredAt: null }), // não entregue: fora
    order({ id: 4, status: "canceled", deliveredAt: "2026-03-06" }), // cancelado: fora
  ];
  const costs = [cost({ amount: 200, startDate: "2026-01-15" })];

  test("receita pela data de entrega, custo das peças, despesas, lucro e R$/hora de impressão", () => {
    const s = financeSummary(orders, costs, "2026-03-01", "2026-04-30");
    expect(s.revenue).toBe(150 + 55); // 10×15 + (50 −10% + frete 10)
    expect(s.cogs).toBe(40 + 8);
    expect(s.expenses).toBe(400); // março e abril
    expect(s.profit).toBe(205 - 48 - 400);
    expect(s.orders).toBe(2);
    expect(s.machineHours).toBe(3); // 10 × 12 min + 60 min
    expect(s.revenuePerHour).toBeCloseTo(205 / 3, 2);
  });

  test("série mensal para o gráfico", () => {
    expect(monthsBetween("2026-02-15", "2026-04-02")).toEqual(["2026-02", "2026-03", "2026-04"]);
    const series = monthlySeries(orders, costs, "2026-03-01", "2026-04-30");
    expect(series).toEqual([
      { month: "2026-03", revenue: 150, costs: 40 + 200, profit: 150 - 240 },
      { month: "2026-04", revenue: 55, costs: 8 + 200, profit: 55 - 208 },
    ]);
  });

  test("quebra por canal e por produto (receita, lucro bruto e quantidade), maior primeiro", () => {
    expect(breakdown(orders, "2026-03-01", "2026-04-30", (_o, i) => i.description)).toEqual([
      { key: "Chaveiro", revenue: 150, grossProfit: 110, qty: 10 },
      { key: "Topo de bolo", revenue: 45, grossProfit: 37, qty: 1 },
    ]);
    expect(breakdown(orders, "2026-03-01", "2026-04-30", (o) => o.channel).map((b) => b.key)).toEqual(["Consumidor final", "Shopee"]);
  });
});

describe("estoque recomendado (insights)", () => {
  test("cobre 14 dias com a média de vendas dos últimos 30", () => {
    expect(recommendedStock(30, 30)).toBe(14);
    expect(recommendedStock(0, 30)).toBe(0);
    expect(recommendedStock(1, 30)).toBe(1); // arredonda para cima
  });
  test("saúde: > 50% saudável, ≥ 20% atenção, abaixo crítico", () => {
    expect(stockHealth(8, 14)).toBe("ok");
    expect(stockHealth(3, 14)).toBe("warn");
    expect(stockHealth(1, 14)).toBe("critical");
    expect(stockHealth(0, 0)).toBe("ok");
  });
});

test("períodos prontos", async () => {
  const { periodRange } = await import("./finance");
  expect(periodRange("month", "2026-09-28")).toEqual(["2026-09-01", "2026-09-30"]);
  expect(periodRange("lastMonth", "2026-01-15")).toEqual(["2025-12-01", "2025-12-31"]);
  expect(periodRange("3m", "2026-02-10")).toEqual(["2025-12-01", "2026-02-28"]);
  expect(periodRange("year", "2026-09-28")).toEqual(["2026-01-01", "2026-12-31"]);
});

test("período anterior de mesma duração e variação", async () => {
  const { previousRange, change } = await import("./finance");
  expect(previousRange("2026-09-01", "2026-09-30")).toEqual(["2026-08-02", "2026-08-31"]);
  expect(previousRange("2026-03-01", "2026-03-01")).toEqual(["2026-02-28", "2026-02-28"]);
  expect(change(150, 100)).toBe(50);
  expect(change(50, -100)).toBe(150);
  expect(change(10, 0)).toBeNull();
});
