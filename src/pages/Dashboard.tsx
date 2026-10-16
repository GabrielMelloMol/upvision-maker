import { AlertTriangle, CalendarClock, CheckCircle2, CircleAlert, PackageSearch, Printer as PrinterIcon, Store, TrendingUp } from "lucide-react";
import { useState } from "react";
import { costsRepo } from "../db/costsRepo";
import { ordersRepo } from "../db/ordersRepo";
import { productsRepo } from "../db/productsRepo";
import { wasteRunsRepo } from "../db/wasteRunsRepo";
import { filaments, materials, printers } from "../db/repo";
import type { Db } from "../db/types";
import type { Filament, Material, Printer } from "../domain/entities";
import { businessHealth, HEALTH_HEADLINE } from "../domain/health";
import { bestOf, breakdown, rankIndicators, change, financeSummary, indicators, periodRange, type Indicator, type OperationalCost } from "../domain/finance";
import { COVER_OPTIONS, DEFAULT_COVER_DAYS, restockSuggestions, WINDOW_DAYS, type RestockLevel } from "../domain/restock";
import { money } from "../domain/format";
import { isLate, orderTotals, paymentOf, STATUS_LABEL, todayIso, type Order } from "../domain/orders";
import { addDays } from "../domain/quotes";
import type { Product } from "../domain/products";
import type { WasteRun } from "../domain/wasteRuns";
import type { Go } from "../pages";
import Button from "../ui/Button";
import Segmented from "../ui/Segmented";
import { StatTile } from "../ui/charts";
import LoadError from "../ui/LoadError";
import { setPendingOpen } from "../ui/search";
import { useData } from "../ui/useData";

const load = async (db: Db) => ({ orders: await ordersRepo.list(db), costs: await costsRepo.list(db), products: await productsRepo.list(db), filaments: await filaments.list(db), materials: await materials.list(db), waste: await wasteRunsRepo.list(db), printers: await printers.list(db) });
const EMPTY = { orders: [] as Order[], costs: [] as OperationalCost[], products: [] as Product[], filaments: [] as Filament[], materials: [] as Material[], waste: [] as WasteRun[], printers: [] as Printer[] };
const OPEN = new Set(["pending", "production", "done"]);
const dateBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

const HEALTH: Record<RestockLevel, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  ok: { icon: CheckCircle2, label: "saudável", cls: "ok" },
  warn: { icon: CircleAlert, label: "atenção", cls: "warn" },
  critical: { icon: AlertTriangle, label: "crítico", cls: "critical" },
} as const;

export default function Dashboard({ go }: { go: Go }) {
  const [data, reload, , error] = useData(load, EMPTY);
  const [cover, setCover] = useState<number>(DEFAULT_COVER_DAYS);
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
  const restock = restockSuggestions(data.orders, data.products, today, cover).slice(0, 6);
  // onde dá mais lucro (últimos 30 dias): por canal, por impressora (a do produto) e por produto
  const from30 = addDays(today, -WINDOW_DAYS);
  const printerOf = (pid: number | null) => data.printers.find((x) => x.id === data.products.find((p) => p.id === pid)?.printerId)?.name ?? "Sem impressora";
  const byChannel = indicators(breakdown(data.orders, from30, today, (o) => o.channel));
  const byPrinter = indicators(breakdown(data.orders, from30, today, (_o, i) => printerOf(i.productId)));
  const byProduct = indicators(breakdown(data.orders, from30, today, (_o, i) => i.description));

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
      </div>

      <section className="card" aria-label="Reposição sugerida">
        <h2 className="card-title"><TrendingUp aria-hidden /> Reposição sugerida</h2>
        {restock.length === 0 ? (
          <p className="muted small">Ainda sem vendas nem pedidos de produtos cadastrados nos últimos {WINDOW_DAYS} dias.</p>
        ) : (
          <table>
            <thead><tr><th>Produto</th><th className="num">Vendeu ({WINDOW_DAYS} dias)</th><th className="num">Pronto</th><th>O que fazer</th></tr></thead>
            <tbody>
              {restock.map((r) => {
                const h = HEALTH[r.level];
                return (
                  <tr key={r.product.id}>
                    {/* nome longo: uma linha com reticências e o nome inteiro na dica (polimento) */}
                    <td className="best-name" title={r.product.name}>
                      {r.product.name}
                    </td>
                    <td className="num">{r.sold.toLocaleString("pt-BR")}</td>
                    <td className="num">{r.stock.toLocaleString("pt-BR")}</td>
                    <td>
                      <span className={`health ${h.cls}`}><h.icon size={12} aria-hidden /> {h.label}</span> {restockText(r)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Segmented label="Cobrir os próximos" value={String(cover)} options={COVER_OPTIONS.map((d) => [String(d), `${d} dias`] as const)} onChange={(v) => setCover(Number(v))} full />
        <p className="hint">Imprimir = vendas médias por dia × {cover} dias + pedidos em aberto − o que já está pronto, em mesas cheias.</p>
      </section>

      <section className="card" aria-label="Onde dá mais lucro">
        <h2 className="card-title"><Store aria-hidden /> Onde dá mais lucro ({WINDOW_DAYS} dias)</h2>
        {byChannel.length + byPrinter.length === 0 ? (
          <p className="muted small">Aparece quando houver pedidos entregues.</p>
        ) : (
          <div className="cols-3">
            <Ranking title="Canal" icon={<Store aria-hidden size={14} />} rows={byChannel} />
            <Ranking title="Impressora" icon={<PrinterIcon aria-hidden size={14} />} rows={byPrinter} />
            <Ranking title="Produto" rows={byProduct.slice(0, 5)} />
          </div>
        )}
        <p className="hint">Lucro bruto = receita − custo das peças − taxas do canal, sem as despesas fixas. R$/h = por hora de máquina, com o tempo de impressão cadastrado nos produtos.</p>
      </section>
    </div>
  );
}

const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);

/** Uma linha por canal, impressora ou produto: lucro bruto, margem e R$/h, com o melhor destacado. */
function Ranking({ title, icon, rows }: { title: string; icon?: React.ReactNode; rows: Indicator[] }) {
  const best = bestOf(rows);
  const ranked = rankIndicators(rows).rows;
  return (
    <div>
      <h3 className="small">{icon} {title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">Sem vendas.</p>
      ) : (
        <ul className="dash-list" aria-label={`Lucro por ${title.toLowerCase()}`}>
          {ranked.map((r) => (
            <li key={r.key}>
              <span>
                {r.key}
                {best?.row.key === r.key && <> <span className="badge ok" title={best.by === "hour" ? "Maior lucro por hora de máquina" : "Maior margem"}>melhor</span></>}
              </span>
              <span className="muted small">
                {money(r.grossProfit)} · {pct(r.margin)}{r.profitPerHour !== null ? ` · ${money(r.profitPerHour)}/h` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A frase de cada linha da reposição: o que imprimir ou por que está em dia. */
function restockText(r: ReturnType<typeof restockSuggestions>[number]): string {
  if (r.toPrint === 0) return r.daysLeft === null ? "em dia" : `em dia · cobre ${plural(r.daysLeft, "dia", "dias")}`;
  const mesas = r.product.piecesPerPlate > 1 ? ` (${plural(r.plates, "mesa", "mesas")})` : "";
  const why = r.stock < r.committed ? ` · faltam ${plural(Math.ceil(r.committed - r.stock), "peça", "peças")} dos pedidos` : r.daysLeft === 0 ? " · acabou" : r.daysLeft !== null && r.daysLeft <= 7 ? ` · acaba em ${plural(r.daysLeft, "dia", "dias")}` : "";
  return `Imprima mais ${r.toPrint.toLocaleString("pt-BR")}${mesas}${why}`;
}

