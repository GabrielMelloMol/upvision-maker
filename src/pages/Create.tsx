import { Search, SearchX, Shapes } from "lucide-react";
import { useEffect, useState } from "react";
import { PAGES, type Go } from "../pages";
import { AMS_LABEL } from "../geometry/amsNeed";
import { openWith, useTakenIntent } from "../tools/intent";
import { openModel } from "../tools/modelPlaces";
import { AMS_NEED, worksWithoutAms } from "../tools/models/amsTable";
import { occasionPicks, searchHits, type Hit } from "../tools/models/createSearch";
import { getCreateView, setCreateView } from "../tools/models/createView";
import { CATEGORIES } from "../tools/models/defs";
import { loadFavorites } from "../tools/models/favorites";
import { modelOf } from "../tools/models/families";
import OccasionChips, { type Occasion } from "../tools/models/OccasionChips";
import { defaultEntry, FILE_TOOL_GROUPS, productsIn, TABS, typesOf, type Entry, type Product, type Tab } from "../tools/models/products";
import { THUMBS } from "../tools/models/thumbs";
import { COLLECTIONS } from "../tools/models/variants";
import EmptyState from "../ui/EmptyState";
import OccasionCard from "../ui/OccasionCard";
import Toggle from "../ui/Toggle";

/** Selo curto do card (#118); o rótulo inteiro (AMS_LABEL) fica na dica. */
const AMS_SHORT = { "uma-cor": "1 cor", "troca-manual": "Pausa p/ trocar cor", ams: "Várias cores" } as const;
const SEARCH_HINT = "chaveiro com nome, placa Pix, topo de bolo";

const pageOf = (id: string) => PAGES.find((p) => p.id === id);
const href = (e: Entry) => (e.kind === "model" ? `#models/${e.id}` : `#${e.page}`);

/** Criar (#139, #250): os produtos em cartões com foto, por categoria, e as ferramentas de arquivo embaixo; uma busca só. */
export default function Create({ go }: { go: Go }) {
  const asked = useTakenIntent<{ occasion?: Occasion; q?: string }>("create"); // do Início (busca e ocasião)
  const [start] = useState(() => (asked?.q !== undefined || asked?.occasion !== undefined ? { tab: "all" as Tab, q: asked.q ?? "", occasion: asked.occasion ?? null } : getCreateView()));
  const [q, setQ] = useState(start.q);
  const [tab, setTab] = useState<Tab>(start.tab);
  const [occasion, setOccasion] = useState<Occasion>(start.occasion);
  const [noAms, setNoAms] = useState(false);
  const [favorites] = useState(loadFavorites);
  useEffect(() => setCreateView({ tab, q, occasion }), [tab, q, occasion]);

  const searching = q.trim().length > 0;
  const hits = searching ? searchHits(q, noAms) : [];
  const picks = !searching && occasion ? occasionPicks(occasion, favorites, noAms) : [];
  const open = (e: React.MouseEvent, entry: Entry) => {
    e.preventDefault();
    if (entry.kind === "model") go(openModel(entry.id)); // o que virou aba de ferramenta (Shadowbox) abre na aba
    else {
      if (entry.intent !== undefined) openWith(entry.page, entry.intent);
      go(entry.page);
    }
  };
  const visible = (p: Product) => !noAms || p.entries.some((e) => e.kind === "tool" || worksWithoutAms(e.id));
  const ams = (id: string | undefined, key: string) => {
    const need = id ? AMS_NEED[id] : undefined;
    return need ? (
      <>
        <span className="ams-need" title={AMS_LABEL[need]} aria-hidden>
          {AMS_SHORT[need]}
        </span>
        <span hidden id={`ams-${key}`}>
          {AMS_LABEL[need]}
        </span>
      </>
    ) : null;
  };
  /** Cartão de produto: foto, nome, o que resolve e quantos tipos; abre a entrada padrão (ou a que a ocasião achou). */
  const ok = (e: Entry) => !noAms || e.kind === "tool" || worksWithoutAms(e.id);
  const card = (p: Product, entry: Entry = defaultEntry(p, ok), types: string | null = typesOf(p)) => {
    const models = p.entries.flatMap((e) => (e.kind === "model" ? [e.id] : []));
    const thumbId = entry.kind === "model" ? entry.id : models[0];
    const thumb = (thumbId && THUMBS[thumbId]) || models.map((id) => THUMBS[id]).find(Boolean);
    const Icon = entry.kind === "tool" ? (pageOf(entry.page)?.icon ?? Shapes) : Shapes;
    const need = entry.kind === "model" ? AMS_NEED[entry.id] : undefined;
    return (
      <li key={p.id}>
        <a href={href(entry)} data-product={p.id} data-family={p.id} data-variants={models.join(",")} aria-describedby={need ? `ams-${p.id}` : undefined} onClick={(e) => open(e, entry)}>
          <span className="model-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
          <strong>{p.label}</strong>
          <small className="product-blurb">{p.blurb}</small>
          <small className="product-meta">
            {types}
            {types && need && " · "}
            {ams(entry.kind === "model" ? entry.id : undefined, p.id)}
          </small>
        </a>
      </li>
    );
  };
  /** Resultado de busca: uma variação (ou ferramenta) por cartão, com o produto dela embaixo. */
  const hitCard = (h: Hit) => {
    const { entry, product } = h;
    const page = entry.kind === "tool" ? pageOf(entry.page) : undefined;
    const model = entry.kind === "model" ? modelOf(entry.id) : undefined;
    const title = model?.label ?? (product && page && page.label !== entry.label ? `${page.label} · ${entry.label}` : (page?.label ?? ""));
    const Icon = model?.icon ?? page?.icon ?? Shapes;
    const thumb = model ? THUMBS[model.id] : undefined;
    const key = `${product?.id ?? "arquivo"}-${entry.kind === "model" ? entry.id : `${entry.page}-${entry.label}`}`;
    return (
      <li key={key}>
        <a href={href(entry)} data-product={product?.id} data-page={entry.kind === "tool" ? entry.page : undefined} onClick={(e) => open(e, entry)}>
          <span className="model-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
          <strong>{title}</strong>
          <small className="product-blurb">{model?.blurb ?? page?.blurb}</small>
          <small className="product-meta">
            {product?.label ?? "Do seu arquivo"}
            {model && AMS_NEED[model.id] && " · "}
            {ams(model?.id, key)}
          </small>
        </a>
      </li>
    );
  };
  const fileTool = (id: string) => {
    const p = pageOf(id);
    if (!p) return null;
    return (
      <li key={id}>
        <a href={`#${id}`} data-page={id} onClick={(e) => open(e, { kind: "tool", page: id, label: p.label })}>
          <p.icon aria-hidden />
          <span>
            <strong>{p.label}</strong>
            <small>{p.blurb}</small>
          </span>
        </a>
      </li>
    );
  };
  const fileGroup = (g: (typeof FILE_TOOL_GROUPS)[number]) => (
    <section key={g.id} aria-labelledby={`create-${g.id}`}>
      <h2 id={`create-${g.id}`}>{g.title}</h2>
      <ul className="create-tools">{g.pages.map(fileTool)}</ul>
    </section>
  );
  const categorySection = ([cat, label]: (typeof CATEGORIES)[number]) => {
    const list = productsIn(cat).filter(visible);
    if (!list.length) return null;
    return (
      <section key={cat} aria-labelledby={`create-${cat}`}>
        <h2 id={`create-${cat}`}>{label}</h2>
        <ul className="create-models create-products">{list.map((p) => card(p))}</ul>
      </section>
    );
  };

  const occasionName = occasion === "favorites" ? "Favoritos" : COLLECTIONS.find(([c]) => c === occasion)?.[1];
  const content = () => {
    if (searching)
      return hits.length ? (
        <section aria-labelledby="create-results">
          <h2 id="create-results">{hits.length === 1 ? "1 resultado" : `${hits.length} resultados`}</h2>
          <ul className="create-models create-products">{hits.map(hitCard)}</ul>
        </section>
      ) : (
        <EmptyState icon={SearchX} title={`Nada com “${q.trim()}”`} action={<button onClick={() => go("ai")}>Pedir à IA</button>}>
          Tente outra palavra, peça à IA para modelar ou <button className="link" onClick={() => go("search3d")}>busque modelos prontos na internet</button>.
        </EmptyState>
      );
    if (occasion)
      return picks.length ? (
        <section aria-labelledby="create-occasion">
          <h2 id="create-occasion">{occasion === "favorites" ? "Seus favoritos" : `Para ${occasionName}`}</h2>
          <ul className="create-models create-products">{picks.map((x) => card(x.product, x.entry, x.matching > 1 ? `${x.matching} tipos` : null))}</ul>
        </section>
      ) : (
        <EmptyState icon={SearchX} title={occasion === "favorites" ? "Nenhum favorito ainda" : "Nada para esta ocasião"}>
          {occasion === "favorites" ? "Abra um modelo e toque na estrela ao lado do nome para guardar aqui." : "Tente outra ocasião."}
        </EmptyState>
      );
    if (tab === "file" || tab === "help") return FILE_TOOL_GROUPS.filter((g) => g.tab === tab).map(fileGroup);
    if (tab === "all")
      return (
        <>
          {CATEGORIES.map(categorySection)}
          {FILE_TOOL_GROUPS.map(fileGroup)}
        </>
      );
    const cat = CATEGORIES.find(([c]) => c === tab);
    return cat ? categorySection(cat) : null;
  };

  return (
    <div className="page create">
      <h1>Criar</h1>
      <OccasionCard go={go} onPick={(o) => (setQ(""), setOccasion(o))} />
      <div className="create-filters">
        <label className="affix has-prefix create-search">
          <Search aria-hidden className="prefix" />
          <input type="search" aria-label="O que você quer criar?" placeholder={`Ex.: ${SEARCH_HINT}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {/* atalho fixo para a biblioteca (#161) */}
        <a className="create-projects" href="#projects" data-page="projects" onClick={(e) => (e.preventDefault(), go("projects"))}>
          Meus projetos →
        </a>
      </div>
      <div className="create-tabs chips" role="group" aria-label="Categoria">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" aria-pressed={!searching && !occasion && tab === t} onClick={() => (setQ(""), setOccasion(null), setTab(t))}>
            {label}
          </button>
        ))}
      </div>
      <div className="create-occasions">
        <span className="muted">Ocasião:</span>
        <OccasionChips occasion={searching ? null : occasion} onOccasion={(o) => (setQ(""), setOccasion(o))} />
      </div>
      <details className="create-more" open={noAms || undefined}>
        <summary>Filtros{noAms ? " · 1 ativo" : ": só modelos de 1 cor"}</summary>
        <Toggle label="Só 1 cor: imprime sem troca automática de cor (AMS)" checked={noAms} onChange={setNoAms} />
      </details>
      {content()}
    </div>
  );
}
