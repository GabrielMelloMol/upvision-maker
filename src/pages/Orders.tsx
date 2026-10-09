import { CalendarClock, ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { money } from "../domain/format";
import { addDays } from "../domain/quotes";
import { isLate, orderTotals, PAYMENT_LABEL, paymentOf, STATUS_LABEL, STATUSES, todayIso, type Order, type OrderStatus } from "../domain/orders";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import LoadError from "../ui/LoadError";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { requestNavigate } from "../ui/navigate";
import { takePendingOpen } from "../ui/search";
import { useData } from "../ui/useData";
import { EMPTY_ORDERS, loadOrdersData } from "./orders/data";
import OrderDetail, { moveOrder } from "./orders/OrderDetail";
import OrderEditor from "./orders/OrderEditor";

const BOARD: OrderStatus[] = ["pending", "production", "done", "delivered"];
const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  pending: ["production", "Iniciar produção"],
  production: ["done", "Concluir"],
  done: ["delivered", "Marcar entregue"],
};
/** Entregues mais antigos que isto saem do quadro (continuam na Lista): a coluna não cresce para sempre (UX M10). */
const RECENT_DELIVERED_DAYS = 30;
const dateBr = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "sem prazo");

export default function Orders() {
  const [data, reload, , error] = useData(loadOrdersData, EMPTY_ORDERS);
  const [view, setView] = useState<"board" | "list">("board");
  const [editing, setEditing] = useState<Order | "new" | null>(null);
  const [openId, setOpenId] = useState<number | null>(() => takePendingOpen("orders")); // vindo da busca global
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const [query, setQuery] = useState("");
  const [printer, setPrinter] = useState(""); // "" = todas, "none" = sem impressora (#188)
  const [dragging, setDragging] = useState<number | null>(null);
  const toast = useToast();
  const today = todayIso();
  const open = data.orders.find((o) => o.id === openId) ?? null;

  async function move(o: Order, to: OrderStatus) {
    try {
      await moveOrder(o, to, data);
      toast(`Pedido #${o.id}: ${STATUS_LABEL[to]}.`);
    } catch (e) {
      toast(errorText(e), "error");
    }
    reload();
  }

  const recentCut = addDays(today, -RECENT_DELIVERED_DAYS);
  const byDue = (a: Order, b: Order) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id - b.id;
  const q = query.trim().toLowerCase();
  const byPrinter = (o: Order) => !printer || (printer === "none" ? (o.printerId ?? null) === null : String(o.printerId) === printer);
  const printerName = (o: Order) => data.printers.find((p) => p.id === o.printerId)?.name;
  const visible = data.orders.filter(byPrinter);
  const filtered = visible.filter((o) => (!status || o.status === status) && (!q || `#${o.id} ${o.customerName} ${o.items.map((i) => i.description).join(" ")}`.toLowerCase().includes(q)));

  const card = (o: Order) => {
    const next = NEXT[o.status];
    const late = isLate(o, today);
    return (
      <article
        key={o.id}
        className={`order-card ${late ? "late" : ""}`}
        draggable
        onDragStart={() => setDragging(o.id)}
        onDragEnd={() => setDragging(null)}
      >
        <button className="order-open" onClick={() => setOpenId(o.id)} aria-label={`Abrir pedido #${o.id} de ${o.customerName}`}>
          <span className="muted small">#{o.id}</span> <b>{o.customerName}</b>
          <span className="small">{o.items.map((i) => `${i.qty}× ${i.description}`).join(", ")}</span>
          <span className="order-meta">
            <span className={late ? "badge nowrap" : "muted small"}>
              <CalendarClock size={12} aria-hidden /> {late ? (o.status === "done" ? "entregar até " : "atrasado ") : ""}
              {dateBr(o.dueDate)}
            </span>
            <b>{money(orderTotals(o.items, o.freight).total)}</b>
          </span>
          {printerName(o) && <span className="muted small">{printerName(o)}</span>}
          {o.status !== "canceled" && paymentOf(o).state !== "paid" && <span className="badge nowrap">{PAYMENT_LABEL[paymentOf(o).state]}{paymentOf(o).state === "partial" ? ` · falta ${money(paymentOf(o).due)}` : ""}</span>}
        </button>
        {next && (
          <Button size="sm" variant="ghost" className="order-next" onClick={() => move(o, next[0])}>
            {next[1]} →
          </Button>
        )}
      </article>
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p className="lead">Acompanhe cada pedido, do pedido até a entrega.</p>
        </div>
        <div className="row">
          {data.printers.length > 0 && (
            <label>
              Impressora
              <select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">Todas</option>
                {data.printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="none">Sem impressora definida</option>
              </select>
            </label>
          )}
          <Segmented
            label="Visualização"
            value={view}
            options={[
              ["board", "Quadro"],
              ["list", "Lista"],
            ]}
            onChange={setView}
          />
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
            Novo pedido
          </Button>
        </div>
      </div>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum pedido ainda" action={<><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Criar o primeiro pedido</Button><Button onClick={() => requestNavigate("products")}>Cadastrar produtos</Button></>}>
          Cadastre produtos antes para o preço e a baixa de estoque saírem sozinhos.
        </EmptyState>
      ) : view === "board" ? (
        <div className="board" aria-label="Quadro de pedidos">
          {BOARD.map((s) => {
            const all = visible.filter((o) => o.status === s);
            const col = (s === "delivered" ? all.filter((o) => !o.deliveredAt || o.deliveredAt >= recentCut) : all).sort(byDue);
            return (
              <section
                key={s}
                className={`board-col ${dragging !== null ? "droppable" : ""}`}
                aria-label={STATUS_LABEL[s]}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const o = data.orders.find((x) => x.id === dragging);
                  if (o && o.status !== s) move(o, s);
                }}
              >
                <h2>
                  {STATUS_LABEL[s]} <span className="muted small">{col.length}</span>
                </h2>
                {col.map(card)}
                {col.length < all.length && (
                  <button
                    className="link"
                    onClick={() => {
                      setStatus("delivered");
                      setView("list");
                    }}
                  >
                    Ver todos os entregues ({all.length})
                  </button>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="row">
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | "")}>
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Buscar
              <input type="search" value={query} placeholder="Cliente, produto ou #número" onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Cliente</th><th>Status</th><th>Prazo</th><th>Canal</th>{data.printers.length > 0 && <th>Impressora</th>}<th>Pagamento</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => setOpenId(o.id)}>
                  <td>
                    <button className="link" onClick={() => setOpenId(o.id)}>#{o.id}</button>
                  </td>
                  <td>{o.customerName}</td>
                  <td>{STATUS_LABEL[o.status]}</td>
                  <td>{isLate(o, today) ? <span className="badge">atrasado · {dateBr(o.dueDate)}</span> : dateBr(o.dueDate)}</td>
                  <td>{o.channel}</td>
                  {data.printers.length > 0 && <td>{printerName(o) ?? "—"}</td>}
                  <td>{o.status === "canceled" ? "—" : PAYMENT_LABEL[paymentOf(o).state]}</td>
                  <td className="num">{money(orderTotals(o.items, o.freight).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted">Nenhum pedido com esses filtros.</p>}
        </>
      )}

      {data.orders.some((o) => o.status === "canceled") && view === "board" && (
        <p className="muted small">Pedidos cancelados ficam na Lista (filtro Status → Cancelado).</p>
      )}

      {open && !editing && (
        <OrderDetail
          order={open}
          data={data}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null);
            reload();
          }}
          onEdit={() => setEditing(open)}
        />
      )}
      {editing && (
        <OrderEditor
          data={data}
          order={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
