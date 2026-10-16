import { Award, Cake, Calculator, ChevronRight, ClipboardList, Cookie, FileText, KeyRound, QrCode, Search, Sun } from "lucide-react";
import { useState, type FormEvent } from "react";
import { openWith } from "../tools/intent";
import { openModel } from "../tools/modelPlaces";
import { ordersRepo } from "../db/ordersRepo";
import { toolProjects, toolState } from "../db/toolStateRepo";
import { openProjectIn } from "../tools/intent";
import { libraryItems, type LibraryItem } from "../tools/projects/library";
import type { Db } from "../db/types";
import { money } from "../domain/format";
import { isLate, orderTotals, STATUS_LABEL, todayIso, type Order } from "../domain/orders";
import { addDays } from "../domain/quotes";
import { PAGES, type Go } from "../pages";
import { setPendingOpen } from "../ui/search";
import { useData } from "../ui/useData";
import OccasionCard from "../ui/OccasionCard";
import StartHere, { type StartSteps } from "../help/StartHere";

/** Atalhos do Início (#250): cada um abre direto a ferramenta ou o modelo, sem passar pela Criar. `model` abre o Modelo pronto. */
type Shortcut = { label: string; icon: typeof KeyRound; page?: string; model?: string };
const CREATE: Shortcut[] = [
  { label: "Chaveiro com nome", icon: KeyRound, page: "keychain" },
  { label: "Placa Pix", icon: QrCode, model: "pix" },
  { label: "Topo de bolo", icon: Cake, model: "cake" },
  { label: "Medalha", icon: Award, page: "medal" },
  { label: "Cortador de biscoito", icon: Cookie, page: "cutter" },
  { label: "Litofania", icon: Sun, page: "lithophane" },
];
const SELL: Shortcut[] = [
  { label: "Calcular preço", icon: Calculator, page: "calculator" },
  { label: "Orçamento", icon: FileText, page: "quotes" },
  { label: "Pedidos", icon: ClipboardList, page: "orders" },
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

const RECENT = 4; // Meus projetos no Início (#161): os 4 últimos, rascunhos e projetos juntos
/** Quais dos 3 primeiros passos do "Comece por aqui" já têm algo feito no app (UX B5). */
const startedSteps = async (db: Db): Promise<StartSteps> => {
  const [r] = await db.select<{ keychain: number; calculator: number; quote: number }>(
    `SELECT (SELECT COUNT(*) FROM tool_projects WHERE toolId = 'keychain') + (SELECT COUNT(*) FROM tool_state WHERE id = 'keychain') AS keychain,
            (SELECT COUNT(*) FROM calc_history) AS calculator,
            (SELECT COUNT(*) FROM quotes) AS quote`,
  );
  return { keychain: r.keychain > 0, calculator: r.calculator > 0, quote: r.quote > 0 };
};
const load = async (db: Db) => ({ recent: libraryItems(await toolProjects.recent(db, RECENT), await toolState.recent(db, RECENT)), orders: await ordersRepo.list(db), steps: await startedSteps(db) });

/** Início (#139): poucas ações, o que ficou pela metade e os prazos da semana. O resto está a um clique na barra lateral. */
export default function Home({ go }: { go: Go }) {
  const [data, , loading] = useData(load, { recent: [] as LibraryItem[], orders: [] as Order[], steps: { keychain: false, calculator: false, quote: false } });
  const today = todayIso();
  const week = data.orders
    .filter((o) => OPEN.has(o.status) && o.dueDate && o.dueDate <= addDays(today, 7))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);
  const recent = data.recent
    .flatMap((it) => {
      const page = PAGES.find((p) => p.id === it.toolId);
      return page ? [{ it, page }] : [];
    })
    .sort((a, b) => b.it.at.localeCompare(a.it.at))
    .slice(0, RECENT);
  const [find, setFind] = useState("");
  const run = (a: Shortcut) => go(a.model ? openModel(a.model) : a.page!);
  const search = (e: FormEvent) => {
    e.preventDefault();
    openWith("create", { q: find.trim() });
    go("create");
  };
  const list = (label: string, items: Shortcut[]) => (
    <ul className="home-actions" aria-label={label}>
      {items.map((a) => (
        <li key={a.label}>
          <button onClick={() => run(a)}>
            <a.icon aria-hidden />
            {a.label}
          </button>
        </li>
      ))}
    </ul>
  );
  const open = (it: LibraryItem) => {
    openProjectIn(it.toolId, it.kind === "draft" ? { resume: true } : { projectId: it.project.id });
    go(it.toolId);
  };

  return (
    <div className="page home">
      <div className="home-hero">
        <h1>{greeting()}</h1>
        <form className="home-search" role="search" onSubmit={search}>
          <label className="affix has-prefix">
            <Search aria-hidden className="prefix" />
            <input type="search" aria-label="O que você quer criar?" placeholder="O que você quer criar? Ex.: chaveiro com nome, placa Pix, topo de bolo" value={find} onChange={(e) => setFind(e.target.value)} />
          </label>
          <button type="submit" className="primary">
            Procurar
          </button>
        </form>
        <div className="home-head">
          <h2 id="home-create">Criar</h2>
          <button className="link" onClick={() => go("create")}>
            Ver todos os produtos
          </button>
        </div>
        {list("Criar", CREATE)}
        <h2 id="home-sell">Vender</h2>
        {list("Vender", SELL)}
      </div>
      <OccasionCard go={go} />
      {!loading && <StartHere go={go} done={data.steps} />}

      {recent.length > 0 && (
        <section aria-labelledby="home-projects">
          <div className="home-head">
            <h2 id="home-projects">Meus projetos</h2>
            <button className="link" onClick={() => go("projects")}>
              Ver todos
            </button>
          </div>
          <ul className="home-list">
            {recent.map(({ it, page }) => (
              <li key={it.key}>
                <button onClick={() => open(it)}>
                  <page.icon aria-hidden />
                  <span>{it.kind === "draft" ? `${page.label} · rascunho` : `${it.name} · ${page.label}`}</span>
                  <span className="muted">{ago(it.at)}</span>
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
