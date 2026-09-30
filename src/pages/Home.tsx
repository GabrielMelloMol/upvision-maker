import { Calculator, ChevronRight, ClipboardList, FileText, KeyRound, Shapes } from "lucide-react";
import { ordersRepo } from "../db/ordersRepo";
import { toolState } from "../db/toolStateRepo";
import type { Db } from "../db/types";
import { money } from "../domain/format";
import { isLate, orderTotals, STATUS_LABEL, todayIso, type Order } from "../domain/orders";
import { addDays } from "../domain/quotes";
import { PAGES, type Go } from "../pages";
import { setPendingOpen } from "../ui/search";
import { useData } from "../ui/useData";
import StartHere from "../help/StartHere";

const ACTIONS = [
  { page: "keychain", label: "Chaveiro", icon: KeyRound },
  { page: "models", label: "Modelo pronto", icon: Shapes },
  { page: "calculator", label: "Calcular preço", icon: Calculator },
  { page: "quotes", label: "Orçamento", icon: FileText },
  { page: "orders", label: "Pedidos", icon: ClipboardList },
];
const OPEN = new Set(["pending", "production", "done"]);
const dateBr = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function greeting(h = new Date().getHours()) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
/** "há 5 minutos", "há 3 horas", "ontem": quando o rascunho foi mexido pela última vez. */
export function ago(iso: string, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 60) return rtf.format(-Math.max(min, 1), "minute");
  if (min < 24 * 60) return rtf.format(-Math.round(min / 60), "hour");
  return rtf.format(-Math.round(min / (24 * 60)), "day");
}

const load = async (db: Db) => ({ drafts: await toolState.recent(db), orders: await ordersRepo.list(db) });

/** Início (#139): poucas ações, o que ficou pela metade e os prazos da semana. O resto está a um clique na barra lateral. */
export default function Home({ go }: { go: Go }) {
  const [data] = useData(load, { drafts: [], orders: [] as Order[] });
  const today = todayIso();
  const week = data.orders
    .filter((o) => OPEN.has(o.status) && o.dueDate && o.dueDate <= addDays(today, 7))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);
  const drafts = data.drafts.flatMap((d) => {
    const page = PAGES.find((p) => p.id === d.id);
    return page ? [{ ...d, page }] : [];
  });

  return (
    <div className="page home">
      <h1>{greeting()}</h1>
      <ul className="home-actions" aria-label="Começar">
        {ACTIONS.map((a) => (
          <li key={a.page}>
            <button onClick={() => go(a.page)}>
              <a.icon aria-hidden />
              {a.label}
            </button>
          </li>
        ))}
      </ul>
      <StartHere go={go} />

      {drafts.length > 0 && (
        <section aria-labelledby="home-drafts">
          <h2 id="home-drafts">Continuar</h2>
          <ul className="home-list">
            {drafts.map((d) => (
              <li key={d.id}>
                <button onClick={() => go(d.id)}>
                  <d.page.icon aria-hidden />
                  <span>{d.page.label}</span>
                  <span className="muted">{ago(d.updatedAt)}</span>
                  <ChevronRight aria-hidden className="chev" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="home-week">
        <div className="home-head">
          <h2 id="home-week">Esta semana</h2>
          <button className="link" onClick={() => go("orders")}>
            Ver pedidos
          </button>
        </div>
        {week.length === 0 ? (
          <p className="muted">Nenhum pedido com prazo até {dateBr(addDays(today, 7))}.</p>
        ) : (
          <ul className="home-list">
            {week.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => {
                    setPendingOpen({ pageId: "orders", recordId: o.id });
                    go("orders");
                  }}
                >
                  <span className={`due ${isLate(o, today) ? "late" : ""}`}>{isLate(o, today) ? "Atrasado" : dateBr(o.dueDate!)}</span>
                  <span>{o.customerName}</span>
                  <span className="muted">{STATUS_LABEL[o.status]}</span>
                  <span className="num">{money(orderTotals(o.items, o.freight).total)}</span>
                  <ChevronRight aria-hidden className="chev" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
