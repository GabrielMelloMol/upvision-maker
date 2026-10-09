import { AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, PackageSearch, TrendingUp } from "lucide-react";
import { costsRepo } from "../db/costsRepo";
import { ordersRepo } from "../db/ordersRepo";
import { productsRepo } from "../db/productsRepo";
import { wasteRunsRepo } from "../db/wasteRunsRepo";
import { filaments, materials } from "../db/repo";
import type { Db } from "../db/types";
import type { Filament, Material } from "../domain/entities";
import { businessHealth, HEALTH_HEADLINE } from "../domain/health";
import { breakdown, change, financeSummary, periodRange, recommendedStock, stockHealth, type OperationalCost } from "../domain/finance";
import { money } from "../domain/format";
import { isLate, orderTotals, paymentOf, STATUS_LABEL, todayIso, type Order } from "../domain/orders";
import { addDays } from "../domain/quotes";
import type { Product } from "../domain/products";
import type { WasteRun } from "../domain/wasteRuns";
import type { Go } from "../pages";
import Button from "../ui/Button";
import { StatTile } from "../ui/charts";
import LoadError from "../ui/LoadError";
import { setPendingOpen } from "../ui/search";
import { useData } from "../ui/useData";

const load = async (db: Db) => ({ orders: await ordersRepo.list(db), costs: await costsRepo.list(db), products: await productsRepo.list(db), filaments: await filaments.list(db), materials: await materials.list(db), waste: await wasteRunsRepo.list(db) });
const EMPTY = { orders: [] as Order[], costs: [] as OperationalCost[], products: [] as Product[], filaments: [] as Filament[], materials: [] as Material[], waste: [] as WasteRun[] };
const WINDOW_DAYS = 30;
const OPEN = new Set(["pending", "production", "done"]);
const dateBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const HEALTH = {
  ok: { icon: CheckCircle2, label: "saudável", cls: "ok" },
  warn: { icon: CircleAlert, label: "atenção", cls: "warn" },
  critical: { icon: AlertTriangle, label: "crítico", cls: "critical" },
} as const;

export default function Dashboard({ go }: { go: Go }) {
  const [data, reload, , error] = useData(load, EMPTY);
  const today = todayIso();
  const [mFrom, mTo] = periodRange("month", today);
  const month = financeSummary(data.orders, data.costs, mFrom, mTo, data.waste);
  const [lFrom, lEnd] = periodRange("lastMonth", today);
  // compara com o mesmo trecho do mês passado (do dia 1 até o mesmo dia), não com o mês inteiro: no começo do mês,
  // "R$ 0,00 ▼ 100%" assustava (UX B6)
  const lTo = `${lEnd.slice(0, 8)}${String(Math.min(Number(today.slice(8)), Number(lEnd.slice(8)))).padStart(2, "0")}`;
  const last = financeSummary(data.orders, data.costs, lFrom, lTo, data.waste);
  const open = data.orders.filter((o) => OPEN.has(o.status));
  const late = open.filter((o) => isLate(o, today));
  const week = open.filter((o) => o.dueDate && o.dueDate <= addDays(today, 7)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const owing = data.orders.filter((o) => paymentOf(o).due > 0);
  const owed = owing.reduce((s, o) => s + paymentOf(o).due, 0);
  const lowFil = data.filaments.filter((f) => f.stockG <= f.minG);
  const lowMat = data.materials.filter((m) => m.stock <= m.min);
  const health = businessHealth({ today, month, lateDueDates: late.map((o) => o.dueDate!), lowStock: lowFil.length + lowMat.length, emptyStock: lowFil.filter((f) => f.stockG <= 0).length + lowMat.filter((m) => m.stock <= 0).length });
  const sold = breakdown(data.orders, addDays(today, -WINDOW_DAYS), today, (_o, i) => String(i.productId ?? "")).filter((b) => b.key);
  const best = sold
    .map((b) => {
      const p = data.products.find((x) => String(x.id) === b.key);
      const rec = recommendedStock(b.qty, WINDOW_DAYS);
      return p && { p, qty: b.qty, rec, health: stockHealth(p.stock, rec) };
    })
    .filter((x) => !!x)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);

  const openOrder = (o: Order) => {
    setPendingOpen({ pageId: "orders", recordId: o.id });
    go("orders");
  };

  return (
    <div className="page stack">
      <div className="page-head">
        <div>
          <h1>Painel</h1>
          <p className="lead">O que precisa de atenção hoje.</p>
        </div>
      </div>
      {error && <LoadError error={error} onRetry={reload} />}
      <section className="card biz-health" aria-label="Saúde do negócio">
        <div className="row">
          <span className="biz-lights" role="img" aria-label={`Semáforo: ${HEALTH[health.level].label}`}>
            {(["critical", "warn", "ok"] as const).map((l) => (
              <i key={l} className={`${l} ${l === health.level ? "on" : ""}`} />
            ))}
          </span>
          <h2 className="card-title">Saúde do negócio: {HEALTH_HEADLINE[health.level]}</h2>
        </div>
        <ul className="biz-checks">
          {health.checks.map((c) => {
            const h = HEALTH[c.level];
            return (
              <li key={c.id}>
                <span className={`health ${h.cls}`}><h.icon size={12} aria-hidden /> {h.label}</span>
                <span>
                  <b>{c.title}</b> · {c.detail}
                </span>
                {c.level !== "ok" ? (
                  <Button size="sm" onClick={() => go(c.page)} aria-label={`Resolver: ${c.title}`}>
                    Ver
                  </Button>
                ) : (
                  <span />
                )}
                {c.level !== "ok" && <span className="muted small biz-todo">O que fazer: {c.todo}</span>}
              </li>
            );
          })}
        </ul>
      </section>
      <div className="stats">
        <StatTile label="Receita do mês" value={money(month.revenue)} delta={change(month.revenue, last.revenue)} hint={`${month.orders} entregues`} />
        <StatTile label="Lucro do mês" value={money(month.profit)} delta={change(month.profit, last.profit)} deltaMoney={month.profit < 0 || last.profit < 0 ? month.profit - last.profit : undefined} tone={month.profit < 0 ? "bad" : undefined} hint={month.profit < 0 ? "prejuízo até agora" : undefined} />
        <StatTile label="Pedidos em aberto" value={String(open.length)} hint={`${open.filter((o) => o.status === "production").length} em produção`} />
        <StatTile label="A receber" value={money(owed)} hint={owing.length ? `${owing.length} ${owing.length === 1 ? "pedido" : "pedidos"} com valor em aberto` : "tudo recebido"} />
        <StatTile label="Atrasados" value={String(late.length)} tone={late.length ? "bad" : undefined} hint={late.length ? "prazo já passou" : "tudo em dia"} />
      </div>

      <div className="cols-3">
        <section className="card">
          <h2 className="card-title"><CalendarClock aria-hidden /> Prazos até {dateBr(addDays(today, 7))}</h2>
          {week.length === 0 ? (
            <p className="muted small">Nenhum pedido com prazo nos próximos 7 dias.</p>
          ) : (
            <ul className="dash-list">
              {week.map((o) => (
                <li key={o.id}>
                  <button className="link" onClick={() => openOrder(o)}>#{o.id} {o.customerName}</button>
                  <span className={isLate(o, today) ? "badge" : "muted small"}>{isLate(o, today) ? "atrasado · " : ""}{dateBr(o.dueDate!)}</span>
                  <span className="muted small">{STATUS_LABEL[o.status]} · {money(orderTotals(o.items, o.freight).total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="card-title"><PackageSearch aria-hidden /> Estoque acabando</h2>
          {lowFil.length + lowMat.length === 0 ? (
            <p className="muted small">Filamentos e materiais acima do mínimo.</p>
          ) : (
            <ul className="dash-list">
              {lowFil.map((f) => (
                <li key={`f${f.id}`}>
                  <span>{[f.material, f.color, f.brand].filter(Boolean).join(" · ")}</span>
                  <span className="badge">{f.stockG.toLocaleString("pt-BR")} g</span>
                </li>
              ))}
              {lowMat.map((m) => (
                <li key={`m${m.id}`}>
                  <span>{m.name}</span>
                  <span className="badge">{m.stock.toLocaleString("pt-BR")} {m.unit}</span>
                </li>
              ))}
            </ul>
          )}
          {(lowFil.length > 0 || lowMat.length > 0) && (
            <div className="row">
              {lowFil.length > 0 && <Button size="sm" onClick={() => go("filaments")}>Repor filamentos</Button>}
              {lowMat.length > 0 && <Button size="sm" onClick={() => go("materials")}>Repor materiais</Button>}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="card-title"><TrendingUp aria-hidden /> Mais vendidos (30 dias)</h2>
          {best.length === 0 ? (
            <p className="muted small">Ainda sem vendas entregues de produtos cadastrados nos últimos 30 dias.</p>
          ) : (
            <table>
              <thead><tr><th>Produto</th><th className="num">Vendidos</th><th className="num">Pronto / ideal</th></tr></thead>
              <tbody>
                {best.map(({ p, qty, rec, health }) => {
                  const h = HEALTH[health];
                  return (
                    <tr key={p.id}>
                      {/* nome longo: uma linha com reticências e o nome inteiro na dica (polimento) */}
                      <td className="best-name" title={p.name}>
                        {p.name}
                      </td>
                      <td className="num">{qty.toLocaleString("pt-BR")}</td>
                      <td className="num">
                        {p.stock.toLocaleString("pt-BR")} / {rec}{" "}
                        <span className={`health ${h.cls}`}><h.icon size={12} aria-hidden /> {h.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="hint">Ideal = vendas médias por dia × 14 dias.</p>
        </section>
      </div>
    </div>
  );
}
