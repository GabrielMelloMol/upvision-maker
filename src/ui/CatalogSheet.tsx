import { CornerDownLeft, Search, SearchX, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./EmptyState";
import { rank } from "./search";
import Sheet from "./Sheet";

export type CatalogItem = { id: string; group: string; title: string; subtitle?: string; keywords?: string };

type Props = { title: string; icon: LucideIcon; items: CatalogItem[]; onPick: (id: string) => void; onManual: () => void; onClose: () => void };

/** Catálogo pesquisável (impressoras, filamentos): lista agrupada por marca; setas navegam, Enter escolhe. */
export default function CatalogSheet({ title, icon: Icon, items, onPick, onManual, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  // rank só filtra: a ordem do catálogo (agrupada por marca) é mantida
  const results = useMemo(() => {
    const hit = new Set(rank(items.map((it) => ({ ...it, pageId: "" })), q).map((it) => it.id));
    return items.filter((it) => hit.has(it.id));
  }, [items, q]);
  const current = Math.min(active, results.length - 1);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = results.length;
      if (n) setActive((current + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[current]) onPick(results[current].id);
    }
  }

  return (
    <Sheet title={title} icon={Icon} onClose={onClose} wide>
      <div className="palette">
        <div className="palette-input">
          <Search aria-hidden />
          <input
            type="search"
            data-autofocus
            role="combobox"
            aria-label="Buscar no catálogo"
            aria-expanded="true"
            aria-controls="catalog-list"
            aria-activedescendant={results[current] ? `cat-${results[current].id}` : undefined}
            placeholder="Marca ou modelo…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
        </div>
        {results.length === 0 ? (
          <EmptyState icon={SearchX} title="Nada encontrado — digite do seu jeito" action={<button type="button" onClick={onManual}>Cadastrar à mão</button>}>
            Nenhum item do catálogo tem “{q}”.
          </EmptyState>
        ) : (
          <ul id="catalog-list" role="listbox" aria-label={title} ref={list}>
            {results.map((it, i) => (
              <li key={it.id} role="presentation">
                {it.group !== results[i - 1]?.group && <div className="palette-group">{it.group}</div>}
                <div
                  id={`cat-${it.id}`}
                  role="option"
                  aria-selected={i === current}
                  data-index={i}
                  className="palette-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => onPick(it.id)}
                >
                  <Icon aria-hidden />
                  <span className="t">{it.title}</span>
                  {it.subtitle && <span className="s">{it.subtitle}</span>}
                  {i === current && <CornerDownLeft className="enter" aria-hidden />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
