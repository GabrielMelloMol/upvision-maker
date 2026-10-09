import type { FinanceSummary } from "./finance";

/**
 * Saúde do negócio (#190): um semáforo no Painel que junta margem do mês, estoque, pedidos atrasados e contas do mês,
 * cada um com o que fazer. O geral é o pior dos quatro.
 */
export type HealthLevel = "ok" | "warn" | "critical";
export type HealthCheck = { id: "margin" | "stock" | "late" | "bills"; level: HealthLevel; title: string; detail: string; todo: string; page: string };
export type HealthInput = {
  today: string;
  /** Resumo do mês corrente (já com custos operacionais e amostras/erros). */
  month: Pick<FinanceSummary, "revenue" | "cogs" | "expenses" | "waste" | "profit">;
  /** Pedidos em aberto com prazo vencido (data do prazo). */
  lateDueDates: string[];
  /** Filamentos e materiais abaixo do mínimo, e quantos desses já zeraram. */
  lowStock: number;
  emptyStock: number;
};

export const MIN_MARGIN = 0.1; // abaixo de 10% de lucro sobre a receita, atenção
export const LATE_CRITICAL_COUNT = 3;
export const LATE_CRITICAL_DAYS = 7;
export const BILLS_GRACE_DAYS = 5; // no começo do mês ainda não dá para cobrar as contas
export const BILLS_WARN_COVER = 0.5; // cobrindo menos da metade do esperado até hoje, crítico

const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, critical: 2 };
export const worst = (levels: HealthLevel[]): HealthLevel => levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "ok" as HealthLevel);

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / DAY_MS);
const pct = (n: number) => `${Math.round(n * 100).toLocaleString("pt-BR")}%`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function marginCheck({ month: m }: HealthInput): HealthCheck {
  const base = { id: "margin" as const, title: "Margem do mês", page: "finance" };
  if (m.revenue <= 0) return { ...base, level: "ok", detail: "Nenhuma venda entregue neste mês ainda.", todo: "Marque os pedidos como entregues para a receita e a margem aparecerem." };
  const margin = m.profit / m.revenue;
  if (m.profit < 0) return { ...base, level: "critical", detail: `Prejuízo de ${brl(-m.profit)} no mês (margem ${pct(margin)}).`, todo: "Confira os preços na Calculadora e os custos no Financeiro: está vendendo abaixo do que gasta." };
  if (margin < MIN_MARGIN) return { ...base, level: "warn", detail: `Margem de ${pct(margin)} no mês, abaixo dos ${pct(MIN_MARGIN)} de segurança.`, todo: "Reveja o preço dos produtos que mais vendem ou reduza perdas e descontos." };
  return { ...base, level: "ok", detail: `Margem de ${pct(margin)} no mês.`, todo: "Nada a fazer." };
}

function stockCheck({ lowStock, emptyStock }: HealthInput): HealthCheck {
  const base = { id: "stock" as const, title: "Estoque", page: "filaments" };
  if (emptyStock > 0) return { ...base, level: "critical", detail: `${emptyStock} ${emptyStock === 1 ? "item zerado" : "itens zerados"} (de ${lowStock} abaixo do mínimo).`, todo: "Reponha antes de aceitar novos pedidos: sem material a produção para." };
  if (lowStock > 0) return { ...base, level: "warn", detail: `${lowStock} ${lowStock === 1 ? "item abaixo" : "itens abaixo"} do mínimo.`, todo: "Faça a reposição dos filamentos e materiais marcados no Painel." };
  return { ...base, level: "ok", detail: "Filamentos e materiais acima do mínimo.", todo: "Nada a fazer." };
}

function lateCheck({ today, lateDueDates }: HealthInput): HealthCheck {
  const base = { id: "late" as const, title: "Pedidos atrasados", page: "orders" };
  if (!lateDueDates.length) return { ...base, level: "ok", detail: "Nenhum pedido com o prazo vencido.", todo: "Nada a fazer." };
  const oldest = Math.max(...lateDueDates.map((d) => days(d, today)));
  const level: HealthLevel = lateDueDates.length >= LATE_CRITICAL_COUNT || oldest > LATE_CRITICAL_DAYS ? "critical" : "warn";
  return { ...base, level, detail: `${lateDueDates.length} ${lateDueDates.length === 1 ? "pedido atrasado" : "pedidos atrasados"}, o mais antigo há ${oldest} ${oldest === 1 ? "dia" : "dias"}.`, todo: "Avise os clientes e combine uma nova data; priorize o mais antigo na impressora." };
}

function billsCheck({ today, month: m }: HealthInput): HealthCheck {
  const base = { id: "bills" as const, title: "Contas do mês", page: "costs" };
  if (m.expenses <= 0) return { ...base, level: "ok", detail: "Nenhum custo operacional neste mês.", todo: "Cadastre aluguel, energia e parcelas em Custos operacionais para ver se as vendas cobrem." };
  const day = Number(today.slice(8));
  const inMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  if (day <= BILLS_GRACE_DAYS) return { ...base, level: "ok", detail: `${brl(m.expenses)} em contas neste mês; o mês está começando.`, todo: "Nada a fazer ainda." };
  const expected = m.expenses * (day / inMonth);
  const gross = m.revenue - m.cogs - m.waste; // o que sobra das vendas antes das contas
  const detail = `Contas de ${brl(m.expenses)}; até hoje as vendas deixaram ${brl(gross)} depois do custo das peças.`;
  if (gross >= expected) return { ...base, level: "ok", detail, todo: "Nada a fazer." };
  return { ...base, level: gross >= expected * BILLS_WARN_COVER ? "warn" : "critical", detail, todo: "Faltam vendas para cobrir as contas do mês: feche os orçamentos em aberto e cobre o que está a receber." };
}

export function businessHealth(input: HealthInput): { level: HealthLevel; checks: HealthCheck[] } {
  const checks = [marginCheck(input), billsCheck(input), lateCheck(input), stockCheck(input)];
  return { level: worst(checks.map((c) => c.level)), checks };
}

export const HEALTH_HEADLINE: Record<HealthLevel, string> = {
  ok: "Tudo certo",
  warn: "Atenção a alguns pontos",
  critical: "Precisa de ação agora",
};
