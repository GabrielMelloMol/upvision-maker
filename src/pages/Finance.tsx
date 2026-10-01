import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { costsRepo } from "../db/costsRepo";
import { ordersRepo } from "../db/ordersRepo";
import { productsRepo } from "../db/productsRepo";
import { printers } from "../db/repo";
import type { Db } from "../db/types";
import { toCsv } from "../domain/csv";
import { breakdown, change, financeSummary, monthlySeries, periodRange, previousRange, type OperationalCost } from "../domain/finance";
import { money } from "../domain/format";
import { lineTotal, orderTotals, todayIso, type Order } from "../domain/orders";
import type { Product } from "../domain/products";
import type { Printer } from "../domain/entities";
import Button from "../ui/Button";
import { HBars, MonthlyBars, ProfitBars, StatTile } from "../ui/charts";
import Segmented from "../ui/Segmented";
import { saveFile } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";

const load = async (db: Db) => ({ orders: await ordersRepo.list(db), costs: await costsRepo.list(db), products: await productsRepo.list(db), printers: await printers.list(db) });
const EMPTY = { orders: [] as Order[], costs: [] as OperationalCost[], products: [] as Product[], printers: [] as Printer[] };
const NO_PRINTER = "Sem impressora";

export default function Finance() {
  const [data] = useData(load, EMPTY);
  const [period, setPeriod] = useState<"month" | "3m" | "12m" | "custom">("3m");
  const [custom, setCustom] = useState(() => periodRange("month", todayIso()));
  const [channel, setChannel] = useState("");
  const [productId, setProductId] = useState("");
  const [printerId, setPrinterId] = useState("");
  const toast = useToast();
  const [from, to] = period === "custom" ? custom : periodRange(period, todayIso());

  const printerOf = (pid: number | null) => {
    const p = data.products.find((x) => x.id === pid);
    return p?.printerId ? String(p.printerId) : "";
  };
  const printerName = (pid: number | null) => data.printers.find((x) => String(x.id) === printerOf(pid))?.name ?? NO_PRINTER;

  // filtros por produto/impressora olham os itens; o frete só conta sem esses filtros (não dá para atribuir)
  const orders = useMemo(() => {
    const itemFilter = productId || printerId;
    return data.orders
      .filter((o) => !channel || o.channel === channel)
      .map((o) => (itemFilter ? { ...o, freight: 0, items: o.items.filter((i) => (!productId || String(i.productId) === productId) && (!printerId || printerOf(i.productId) === printerId)) } : o))
      .filter((o) => o.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, channel, productId, printerId]);
  const costs = printerId ? data.costs.filter((c) => String(c.printerId) === printerId) : productId ? [] : data.costs;

  const s = financeSummary(orders, costs, from, to);
  const [pFrom, pTo] = previousRange(from, to);
  const prev = financeSummary(orders, costs, pFrom, pTo);
  const series = monthlySeries(orders, costs, from, to);
  const byChannel = breakdown(orders, from, to, (o) => o.channel);
  const byProduct = breakdown(orders, from, to, (_o, i) => i.description).slice(0, 8);
  const byPrinter = breakdown(orders, from, to, (_o, i) => printerName(i.productId));
  const channels = [...new Set(data.orders.map((o) => o.channel))];

  async function exportCsv() {
    const delivered = orders.filter((o) => o.status === "delivered" && o.deliveredAt && o.deliveredAt >= from && o.deliveredAt <= to);
    const rows: (string | number | null)[][] = [["Pedido", "Entregue em", "Cliente", "Canal", "Item", "Qtd", "Preço un.", "Desconto %", "Total do item", "Custo un.", "Lucro bruto do item", "Frete do pedido", "Total do pedido"]];
    for (const o of delivered) {
      const total = orderTotals(o.items, o.freight).total;
      o.items.forEach((i, k) => rows.push([o.id, o.deliveredAt, o.customerName, o.channel, i.description, i.qty, i.unitPrice, i.discountPct, lineTotal(i), i.unitCost, Math.round((lineTotal(i) - i.unitCost * i.qty) * 100) / 100, k === 0 ? o.freight : null, k === 0 ? total : null]));
    }
    rows.push([], ["Resumo", `${from} a ${to}`], ["Receita", s.revenue], ["Custo das peças", s.cogs], ["Despesas operacionais", s.expenses], ["Lucro", s.profit], ["Horas de impressão", s.machineHours], ["R$ por hora de impressão", s.revenuePerHour]);
    try {
      const path = await saveFile(`financeiro-${from}-a-${to}.csv`, toCsv(rows), "csv", "Planilha CSV");
      if (path) toast(`Planilha salva em ${path}`);
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <div className="page stack">
      <div className="page-head">
        <div>
          <h1>Financeiro</h1>
          <p className="lead">Receita pela data de entrega dos pedidos.</p>
        </div>
        <Button variant="action" icon={FileSpreadsheet} onClick={exportCsv}>
          Exportar planilha
        </Button>
      </div>

      <div className="row filters">
        <Segmented
          label="Período"
          value={period}
          options={[
            ["month", "Este mês"],
            ["3m", "3 meses"],
            ["12m", "12 meses"],
            ["custom", "Personalizado"],
          ]}
          onChange={setPeriod}
        />
        {period === "custom" && (
          <>
            <label>De<input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} /></label>
            <label>Até<input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} /></label>
          </>
        )}
        <label>
          Canal
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Todos</option>
            {channels.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Produto
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos</option>
            {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>
          Impressora
          <select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
            <option value="">Todas</option>
            {data.printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="stats" aria-live="polite">
        <StatTile label="Receita" value={money(s.revenue)} delta={change(s.revenue, prev.revenue)} hint={`${s.orders} pedidos entregues`} />
        <StatTile label="Custo das peças" value={money(s.cogs)} delta={change(s.cogs, prev.cogs)} upIsGood={false} />
        <StatTile label="Custos operacionais" value={money(s.expenses)} delta={change(s.expenses, prev.expenses)} upIsGood={false} hint={productId ? "não se aplicam a um produto" : undefined} />
        <StatTile label="Lucro" value={money(s.profit)} delta={change(s.profit, prev.profit)} deltaMoney={s.profit < 0 || prev.profit < 0 ? s.profit - prev.profit : undefined} tone={s.profit < 0 ? "bad" : undefined} hint={s.profit < 0 ? "prejuízo no período" : undefined} />
        <StatTile label="R$ por hora de impressão" value={s.revenuePerHour === null ? "—" : money(s.revenuePerHour)} hint={`${s.machineHours.toLocaleString("pt-BR")} h de máquina (faturamento, não lucro)`} />
        <StatTile label="Ticket médio" value={s.averageTicket === null ? "—" : money(s.averageTicket)} />
      </div>

      <section className="card">
        <h2 className="card-title">Receita e custos por mês</h2>
        <MonthlyBars data={series} />
      </section>
      <section className="card">
        <h2 className="card-title">Lucro por mês</h2>
        <ProfitBars data={series} />
      </section>

      <div className="cols-3">
        <section className="card">
          <h2 className="card-title">Por canal</h2>
          <HBars rows={byChannel.map((b) => ({ label: b.key, value: b.revenue, sub: `lucro bruto ${money(b.grossProfit)}` }))} />
        </section>
        <section className="card">
          <h2 className="card-title">Mais vendidos</h2>
          <HBars rows={byProduct.map((b) => ({ label: b.key, value: b.revenue, sub: `${b.qty.toLocaleString("pt-BR")} un` }))} />
        </section>
        <section className="card">
          <h2 className="card-title">Por impressora</h2>
          <HBars rows={byPrinter.map((b) => ({ label: b.key, value: b.revenue, sub: `lucro bruto ${money(b.grossProfit)}` }))} />
        </section>
      </div>
    </div>
  );
}
