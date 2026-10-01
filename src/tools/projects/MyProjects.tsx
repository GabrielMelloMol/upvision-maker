import { FolderOpen, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { getDb } from "../../db";
import { ordersRepo } from "../../db/ordersRepo";
import { photos } from "../../db/photosRepo";
import { productsRepo } from "../../db/productsRepo";
import { toolProjects, toolState, type ProjectPatch, type ToolProject } from "../../db/toolStateRepo";
import type { Db } from "../../db/types";
import { PAGES, type Go } from "../../pages";
import { UNDO_MS } from "../../ui/CrudPage";
import EmptyState from "../../ui/EmptyState";
import Menu from "../../ui/Menu";
import Toggle from "../../ui/Toggle";
import { errorText, useToast } from "../../ui/Toast";
import { useData } from "../../ui/useData";
import { openProjectIn } from "../intent";
import { allTags, filterLibrary, libraryItems, NO_FILTERS, type Filters, type LibraryItem, type Period } from "./library";
import ProjectSheet from "./ProjectSheet";

const DRAFTS_MAX = 50;
const PERIODS: [Period, string][] = [
  ["all", "Qualquer data"],
  ["7", "Últimos 7 dias"],
  ["30", "Últimos 30 dias"],
];

type Data = { projects: ToolProject[]; drafts: { id: string; updatedAt: string }[]; products: { id: number; label: string }[]; orders: { id: number; label: string }[]; covers: Record<number, string> };
const load = async (db: Db): Promise<Data> => {
  const [projects, drafts, products, orders, covers] = await Promise.all([toolProjects.all(db), toolState.recent(db, DRAFTS_MAX), productsRepo.list(db), ordersRepo.list(db), photos.covers(db, "project")]);
  return {
    covers,
    projects,
    drafts,
    products: products.map((p) => ({ id: p.id, label: p.name })),
    orders: orders.map((o) => ({ id: o.id, label: `#${o.id} · ${o.customerName}` })),
  };
};

const pageOf = (toolId: string) => PAGES.find((p) => p.id === toolId);
const toolLabel = (toolId: string) => pageOf(toolId)?.label ?? toolId;
/** "30 de set." no ano atual; com o ano quando é de outro ano. */
const when = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
};

/** Meus projetos (#161): tudo o que foi feito nas ferramentas e modelos, com os rascunhos em andamento no topo. */
export default function MyProjects({ go }: { go: Go }) {
  const [data, reload, loading] = useData(load, { projects: [], drafts: [], products: [], orders: [], covers: {} } as Data);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ToolProject | null>(null);
  const toast = useToast();
  const set = <K extends keyof Filters>(k: K) => (v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  // só ferramentas que existem no app (um rascunho de ferramenta removida não aparece)
  const items = useMemo(() => libraryItems(data.projects, data.drafts).filter((it) => pageOf(it.toolId) && !hidden.has(it.key)), [data, hidden]);
  const shown = filterLibrary(items, filters, toolLabel);
  const tools = [...new Set(items.map((i) => i.toolId))];
  const tags = allTags(items);

  function open(it: LibraryItem) {
    openProjectIn(it.toolId, it.kind === "draft" ? { resume: true } : { projectId: it.project.id });
    go(it.toolId);
  }

  async function act(fn: (db: Db) => Promise<unknown>, done?: string) {
    try {
      await fn(await getDb());
      reload();
      if (done) toast(done);
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  async function again(p: ToolProject) {
    try {
      const id = await toolProjects.duplicate(await getDb(), p.id);
      openProjectIn(p.toolId, { projectId: id });
      go(p.toolId);
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  /** Some já e só apaga depois do prazo de desfazer (como nos cadastros). */
  function remove(it: LibraryItem) {
    setHidden((h) => new Set(h).add(it.key));
    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      void act(async (db) => {
        if (it.kind === "draft") return toolState.remove(db, it.toolId);
        await toolProjects.remove(db, it.project.id);
        await photos.removeOwner(db, `project:${it.project.id}`);
      });
    }, UNDO_MS);
    toast(`"${it.kind === "draft" ? `Rascunho de ${toolLabel(it.toolId)}` : it.name}" excluído.`, "ok", {
      label: "Desfazer",
      onClick: () => {
        undone = true;
        clearTimeout(timer);
        setHidden((h) => new Set([...h].filter((k) => k !== it.key)));
      },
    });
  }

  function save(p: ToolProject, patch: ProjectPatch) {
    setEditing(null);
    void act((db) => toolProjects.update(db, p.id, patch), "Projeto salvo.");
  }

  return (
    <div className="page projects">
      <h1>Meus projetos</h1>
      <p className="lead">Tudo o que você criou nas ferramentas, com os rascunhos em andamento.</p>
      {items.length > 0 && (
        <div className="create-filters">
          <label className="affix has-prefix create-search">
            <Search aria-hidden className="prefix" />
            <input type="search" aria-label="Buscar projeto" placeholder="Buscar por nome, ferramenta ou tag" value={filters.q} onChange={(e) => set("q")(e.target.value)} />
          </label>
          <select aria-label="Ferramenta" value={filters.toolId} onChange={(e) => set("toolId")(e.target.value)}>
            <option value="">Todas as ferramentas</option>
            {tools.map((id) => (
              <option key={id} value={id}>
                {toolLabel(id)}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <select aria-label="Tag" value={filters.tag} onChange={(e) => set("tag")(e.target.value)}>
              <option value="">Todas as tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Data" value={filters.period} onChange={(e) => set("period")(e.target.value as Period)}>
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Toggle label="Só favoritos" checked={filters.favorites} onChange={set("favorites")} />
        </div>
      )}

      {!loading && !items.length && (
        <EmptyState icon={FolderOpen} title="Nenhum projeto ainda" action={<button className="primary" onClick={() => go("create")}>Criar algo</button>}>
          Tudo o que você salvar nas ferramentas e nos modelos prontos aparece aqui, para abrir de novo ou fazer outra vez.
        </EmptyState>
      )}
      {items.length > 0 && !shown.length && <p className="muted">Nenhum projeto com esses filtros.</p>}

      <ul className="create-models projects-grid" aria-label="Projetos">
        {shown.map((it) => {
          const page = pageOf(it.toolId)!;
          // foto real da peça (#162) no lugar do render
          const thumb = it.kind === "project" ? (data.covers[it.project.id] ?? it.project.thumb) : null;
          const title = it.kind === "draft" ? `Rascunho de ${page.label}` : it.name;
          return (
            <li key={it.key}>
              <button type="button" className="project-open" onClick={() => open(it)} aria-label={`Abrir ${title}`}>
                <span className="model-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <page.icon aria-hidden />}</span>
                <strong>
                  {it.kind === "draft" ? <span className="pill">Rascunho</span> : null} {it.kind === "draft" ? page.label : it.name}
                </strong>
                <small>
                  {it.kind === "draft" ? "em andamento" : page.label} · {when(it.at)}
                </small>
              </button>
              <div className="project-actions">
                {it.kind === "project" && (
                  <button type="button" className="ghost icon-only sm" aria-pressed={it.favorite} aria-label={`Favorito: ${it.name}`} title="Favorito" onClick={() => void act((db) => toolProjects.update(db, it.project.id, { favorite: !it.favorite }))}>
                    <Star aria-hidden size={16} fill={it.favorite ? "currentColor" : "none"} />
                  </button>
                )}
                <Menu
                  label={`Ações de ${title}`}
                  items={
                    it.kind === "draft"
                      ? [
                          { label: "Continuar", onSelect: () => open(it) },
                          { label: "Excluir", onSelect: () => remove(it), danger: true },
                        ]
                      : [
                          { label: "Abrir", onSelect: () => open(it) },
                          { label: "Fazer de novo", onSelect: () => void again(it.project) },
                          { label: "Renomear e tags…", onSelect: () => setEditing(it.project) },
                          { label: "Excluir", onSelect: () => remove(it), danger: true },
                        ]
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <ProjectSheet project={editing} products={data.products} orders={data.orders} onSave={(patch) => save(editing, patch)} onClose={() => setEditing(null)} onPhotos={reload} />}
    </div>
  );
}
