import { z } from "zod";
import { round2 } from "./format";
import { lineTotal, orderTotals, todayIso, type Order, type OrderItem } from "./orders";
import { wasteTotals, type WasteRun } from "./wasteRuns";

export const FREQUENCIES = ["once", "weekly", "monthly", "yearly"] as const;
export const FREQUENCY_LABEL: Record<(typeof FREQUENCIES)[number], string> = { once: "Único", weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const OperationalCostInput = z.object({
  description: z.string().trim().min(1, "Obrigatório").max(120),
  category: z.string().trim().max(60),
  amount: z.number().positive("Precisa ser maior que 0"),
  frequency: z.enum(FREQUENCIES),
  startDate: date,
  endDate: date.nullable(), // parcelas / contrato com fim
  printerId: z.number().int().positive().nullable(),
  notes: z.string().trim().max(500),
});
export type OperationalCostInput = z.infer<typeof OperationalCostInput>;
export type OperationalCost = OperationalCostInput & { id: number };

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m 1–12

/** Datas em que o custo acontece dentro de [from, to] (dia 31 cai no último dia dos meses curtos). */
export function costOccurrences(c: Pick<OperationalCost, "frequency" | "startDate" | "endDate">, from: string, to: string): string[] {
  const end = c.endDate && c.endDate < to ? c.endDate : to;
  if (c.frequency === "once") return c.startDate >= from && c.startDate <= end ? [c.startDate] : [];
  const out: string[] = [];
  const [y0, m0, d0] = c.startDate.split("-").map(Number);
  const MAX = 5000;
  for (let k = 0; k < MAX; k++) {
    let iso: string;
    if (c.frequency === "weekly") {
      const d = new Date(y0, m0 - 1, d0 + 7 * k);
      iso = todayIso(d);
    } else {
      const months = c.frequency === "monthly" ? k : 12 * k;
      const y = y0 + Math.floor((m0 - 1 + months) / 12);
      const m = ((m0 - 1 + months) % 12) + 1;
      iso = `${y}-${pad(m)}-${pad(Math.min(d0, lastDay(y, m)))}`;
    }
    if (iso > end) break;
    if (iso >= from) out.push(iso);
  }
  return out;
}

const expensesIn = (costs: OperationalCost[], from: string, to: string) => costs.reduce((s, c) => s + c.amount * costOccurrences(c, from, to).length, 0);

/** Entregues no período (a receita entra no dia da entrega). Cancelados nunca contam. */
const deliveredIn = (orders: Order[], from: string, to: string) => orders.filter((o) => o.status === "delivered" && o.deliveredAt && o.deliveredAt >= from && o.deliveredAt <= to);

const cogsOf = (o: Order) => o.items.reduce((s, i) => s + i.unitCost * i.qty, 0);

export type FinanceSummary = { revenue: number; cogs: number; expenses: number; /** Material de amostras e erros de impressão (#189), fora das vendas. */ waste: number; profit: number; orders: number; machineHours: number; revenuePerHour: number | null; averageTicket: number | null };

export function financeSummary(orders: Order[], costs: OperationalCost[], from: string, to: string, wasteRuns: WasteRun[] = []): FinanceSummary {
  const done = deliveredIn(orders, from, to);
  const revenue = round2(done.reduce((s, o) => s + orderTotals(o.items, o.freight).total, 0));
  const cogs = round2(done.reduce((s, o) => s + cogsOf(o), 0));
  const expenses = round2(expensesIn(costs, from, to));
  const waste = wasteTotals(wasteRuns, from, to).total;
  const machineHours = round2(done.reduce((s, o) => s + o.items.reduce((t, i) => t + i.printMinutes * i.qty, 0), 0) / 60);
  return {
    revenue,
    cogs,
    expenses,
    waste,
    profit: round2(revenue - cogs - expenses - waste),
    orders: done.length,
    machineHours,
    // faturamento (não lucro) por hora de máquina, como na referência
    revenuePerHour: machineHours > 0 ? round2(revenue / machineHours) : null,
    averageTicket: done.length ? round2(revenue / done.length) : null,
  };
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [y1, m1] = to.split("-").map(Number);
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export type MonthPoint = { month: string; revenue: number; costs: number; profit: number };

/** Receita × custos (peças + despesas) por mês, limitado ao período. */
export function monthlySeries(orders: Order[], costs: OperationalCost[], from: string, to: string, wasteRuns: WasteRun[] = []): MonthPoint[] {
  return monthsBetween(from, to).map((month) => {
    const [y, m] = month.split("-").map(Number);
    const a = `${month}-01` < from ? from : `${month}-01`;
    const b = `${month}-${pad(lastDay(y, m))}` > to ? to : `${month}-${pad(lastDay(y, m))}`;
    const s = financeSummary(orders, costs, a, b, wasteRuns);
    return { month, revenue: s.revenue, costs: round2(s.cogs + s.expenses + s.waste), profit: s.profit };
  });
}

export type BreakdownRow = { key: string; revenue: number; grossProfit: number; qty: number };

/** Receita, lucro bruto (sem despesas fixas) e quantidade agrupados por uma chave (canal, produto, impressora…). */
export function breakdown(orders: Order[], from: string, to: string, keyOf: (o: Order, i: OrderItem) => string): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const o of deliveredIn(orders, from, to)) {
    for (const i of o.items) {
      const k = keyOf(o, i);
      const cur = map.get(k) ?? { key: k, revenue: 0, grossProfit: 0, qty: 0 };
      const rev = lineTotal(i);
      map.set(k, { key: k, revenue: round2(cur.revenue + rev), grossProfit: round2(cur.grossProfit + rev - i.unitCost * i.qty), qty: cur.qty + i.qty });
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

const COVER_DAYS = 14;

/** Estoque pronto recomendado: média diária de vendas × 14 dias de cobertura. */
export const recommendedStock = (soldInWindow: number, windowDays: number) => Math.ceil((soldInWindow / windowDays) * COVER_DAYS);

/** Saúde do estoque: atual/recomendado > 0,5 saudável, ≥ 0,2 atenção, abaixo disso crítico. */
export function stockHealth(current: number, recommended: number): "ok" | "warn" | "critical" {
  if (recommended <= 0) return "ok";
  const r = current / recommended;
  return r > 0.5 ? "ok" : r >= 0.2 ? "warn" : "critical";
}

export const PERIODS = ["month", "lastMonth", "3m", "6m", "12m", "year", "custom"] as const;
export type Period = (typeof PERIODS)[number];
/** [início, fim] do período (datas ISO). "Últimos N meses" inclui o mês atual. */
export function periodRange(p: Exclude<Period, "custom">, today: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  const monthStart = (yy: number, mm: number) => {
    const d = new Date(yy, mm - 1, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  };
  const monthEnd = (yy: number, mm: number) => {
    const d = new Date(yy, mm, 0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  switch (p) {
    case "month":
      return [monthStart(y, m), monthEnd(y, m)];
    case "lastMonth":
      return [monthStart(y, m - 1), monthEnd(y, m - 1)];
    case "year":
      return [`${y}-01-01`, `${y}-12-31`];
    default: {
      const n = Number(p.replace("m", ""));
      return [monthStart(y, m - n + 1), monthEnd(y, m)];
    }
  }
}

/**
 * Período imediatamente anterior para comparar: se for de meses inteiros (1º dia a último dia),
 * os mesmos N meses de calendário antes; senão, a janela de mesma duração em dias.
 */
export function previousRange(from: string, to: string): [string, string] {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  if (fd === 1 && td === lastDay) {
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    const start = new Date(fy, fm - 1 - months, 1);
    const end = new Date(fy, fm - 1, 0);
    return [todayIso(start), todayIso(end)];
  }
  const day = 86_400_000;
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  const len = Math.round((b - a) / day) + 1;
  return [todayIso(new Date(a - len * day)), todayIso(new Date(a - day))];
}

const MONTHLY_FACTOR = { once: 0, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 } as const;

/** Soma mensal equivalente dos custos recorrentes em vigor hoje (já começaram e não terminaram). */
export function monthlyRecurring(costs: Pick<OperationalCost, "frequency" | "amount" | "startDate" | "endDate">[], today: string): number {
  return costs.reduce((s, c) => (c.startDate <= today && (!c.endDate || c.endDate >= today) ? s + c.amount * MONTHLY_FACTOR[c.frequency] : s), 0);
}

/** Custos operacionais rateados por hora de impressão (0 quando a opção está desligada). */
export function fixedCostPerHour(costs: Parameters<typeof monthlyRecurring>[0], s: { includeFixedCosts: boolean; productiveHoursMonth: number }, today: string): number {
  return s.includeFixedCosts && s.productiveHoursMonth > 0 ? round2(monthlyRecurring(costs, today) / s.productiveHoursMonth) : 0;
}

/** Variação percentual; null quando não há base de comparação. */
export const change = (cur: number, prev: number): number | null => (prev === 0 ? null : round2(((cur - prev) / Math.abs(prev)) * 100));
