import { PAGE_ALIASES, PAGE_TABS } from "./pageAliases";
import { BookOpen, CircleHelp, CornerDownLeft, Moon, Search, Sun, SunMoon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getDb } from "../db";
import { ARTICLES } from "../help/articles";
import { GLOSSARY } from "../help/glossary";
import type { PageDef } from "../pages";
import { loadSearchItems, rank, type SearchItem } from "./search";
import { applyTheme, type Theme } from "./theme";

/** Artigos de ajuda (abrem a tela e a ajuda dela) e termos do glossário. */
function helpItems(pages: PageDef[]): SearchItem[] {
  const articles = ARTICLES.filter((a) => pages.some((p) => p.id === a.id)).map((a) => ({
    id: `help-${a.id}`,
    title: `Como usar: ${a.title}`,
    subtitle: a.intro,
    group: "Ajuda",
    icon: CircleHelp,
    pageId: a.id,
    help: a.id,
    keywords: [...a.steps, ...(a.tips ?? [])].join(" "),
  }));
  const terms = GLOSSARY.map((t) => ({ id: `term-${t.id}`, title: `O que é ${t.term}?`, subtitle: t.text, group: "Ajuda", icon: BookOpen, pageId: "", help: `term:${t.id}`, keywords: t.match.join(" ") }));
  return [...articles, ...terms];
}

/** Claro/escuro pela busca (#152). */
const THEME_ITEMS: SearchItem[] = (
  [
    ["dark", "Modo escuro", Moon, "tema aparência noite escuro dark"],
    ["light", "Modo claro", Sun, "tema aparência dia claro light"],
    ["auto", "Aparência automática", SunMoon, "tema aparência sistema automático claro escuro"],
  ] as const
).map(([t, title, icon, keywords]) => ({ id: `theme-${t}`, title, subtitle: t === "auto" ? "Segue o claro/escuro do sistema" : undefined, group: "Aparência", icon, pageId: "", keywords, run: () => void applyTheme(t as Theme, { save: true }) }));

type Props = { pages: PageDef[]; onPick: (item: SearchItem) => void; onClose: () => void };

const MAX_RESULTS = 40;

/**
 * Resultados da busca: telas, abas, Modelos prontos, registros, ajuda e aparência. Usado pelo ⌘K e pela caixa do Início
 * (#316). Registros e o catálogo de modelos só carregam quando `load` liga (busca aberta ou alguém digitando).
 */
export function useSearchResults(pages: PageDef[], q: string, load = true) {
  const [records, setRecords] = useState<SearchItem[]>([]);
  const [models, setModels] = useState<SearchItem[]>([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (!load || loaded.current) return;
    loaded.current = true;
    import("./modelSearchItems").then((m) => setModels(m.MODEL_ITEMS), (e) => console.warn("Busca sem Modelos prontos:", e));
    getDb()
      .then(loadSearchItems)
      .then(setRecords)
      .catch((e) => console.warn("Busca sem registros:", e));
  }, [load]);

  return useMemo(() => {
    const screens: SearchItem[] = pages.map((p) => ({ id: `page-${p.id}`, title: p.label, subtitle: p.blurb, group: "Telas", icon: p.icon, pageId: p.id, keywords: PAGE_ALIASES[p.id] }));
    // abas de telas que juntaram ferramentas (Organizadores): achadas pelo nome antigo, abrem já na aba; só buscando
    const tabs: SearchItem[] = q.trim()
      ? PAGE_TABS.flatMap((t) => {
          const page = pages.find((p) => p.id === t.pageId);
          return page ? [{ id: `tab-${t.pageId}-${t.tab}`, title: t.label, subtitle: t.blurb, group: "Telas", icon: page.icon, pageId: t.pageId, intent: { tab: t.tab }, keywords: t.keywords }] : [];
        })
      : [];
    // ajuda (#84): só aparece buscando, para não encher a lista inicial
    const help: SearchItem[] = q.trim() ? helpItems(pages) : [];
    return rank([...screens, ...tabs, ...(q.trim() ? models : []), ...records, ...help, ...(q.trim() ? THEME_ITEMS : [])], q).slice(0, MAX_RESULTS);
  }, [pages, records, models, q]);
}

/** Setas andam pela lista (dando a volta), Enter escolhe. `current` = -1: nada marcado (o Enter fica para o formulário). */
export function navKey(e: React.KeyboardEvent, results: SearchItem[], current: number, setActive: (i: number) => void, onPick: (item: SearchItem) => void) {
  const n = results.length;
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
    e.preventDefault();
    setActive(current < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (current + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
  } else if (e.key === "Enter" && results[current]) {
    e.preventDefault();
    onPick(results[current]);
  }
}

/** A lista de resultados (com os grupos), igual no ⌘K e no Início. */
export function ResultList({ id, prefix, results, current, q, setActive, onPick }: { id: string; /** Começo do id de cada opção (aria-activedescendant). */ prefix: string; results: SearchItem[]; current: number; q: string; setActive: (i: number) => void; onPick: (item: SearchItem) => void }) {
  return (
    <ul id={id} role="listbox" aria-label="Resultados">
      {results.length === 0 && <li className="palette-empty">Nada encontrado para “{q}”. Tente outra palavra.</li>}
      {results.map((it, i) => {
        const header = it.group !== results[i - 1]?.group ? it.group : null;
        const Icon = it.icon;
        return (
          <li key={it.id} role="presentation">
            {header && <div className="palette-group">{header}</div>}
            <div id={`${prefix}-${it.id}`} role="option" aria-selected={i === current} data-index={i} className="palette-item" onMouseMove={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(it)}>
              {Icon && <Icon aria-hidden />}
              <span className="t">{it.title}</span>
              {it.subtitle && <span className="s">{it.subtitle}</span>}
              {i === current && <CornerDownLeft className="enter" aria-hidden />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Busca global (Cmd/Ctrl+K): telas e registros. Setas navegam, Enter abre, Esc fecha. */
export default function CommandPalette({ pages, onPick, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    return () => {
      d.close();
      opener?.focus?.();
    };
  }, []);

  const results = useSearchResults(pages, q);
  const current = Math.min(active, results.length - 1);

  useEffect(() => {
    ref.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Buscar"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="palette-input">
        <Search aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-label="Buscar telas e registros"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[current] ? `pal-${results[current].id}` : undefined}
          placeholder="Buscar telas, modelos, filamentos, produtos…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => navKey(e, results, current, setActive, onPick)}
        />
        <kbd>esc</kbd>
      </div>
      <ResultList id="palette-list" prefix="pal" results={results} current={current} q={q} setActive={setActive} onPick={onPick} />
    </dialog>
  );
}
