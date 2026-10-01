import type { ToolProject } from "../../db/toolStateRepo";
import { projectTags } from "../../db/toolStateRepo";

/**
 * Meus projetos (#161): projetos salvos (tool_projects) e rascunhos (tool_state, um por ferramenta) numa lista só.
 * Funções puras de busca e filtro; a tela fica em MyProjects.tsx.
 */
export type LibraryItem =
  | { kind: "draft"; key: string; toolId: string; name: string; at: string }
  | { kind: "project"; key: string; toolId: string; name: string; at: string; project: ToolProject; tags: string[]; favorite: boolean };

export type Period = "all" | "7" | "30";
export type Filters = { q: string; toolId: string; tag: string; favorites: boolean; period: Period };
export const NO_FILTERS: Filters = { q: "", toolId: "", tag: "", favorites: false, period: "all" };

const DAY_MS = 24 * 3600 * 1000;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function libraryItems(projects: ToolProject[], drafts: { id: string; updatedAt: string }[]): LibraryItem[] {
  const ds: LibraryItem[] = drafts.map((d) => ({ kind: "draft", key: `draft:${d.id}`, toolId: d.id, name: "Rascunho", at: d.updatedAt }));
  const ps: LibraryItem[] = projects.map((p) => ({ kind: "project", key: `project:${p.id}`, toolId: p.toolId, name: p.name || "Sem nome", at: p.updatedAt || p.at, project: p, tags: projectTags(p), favorite: !!p.favorite }));
  return [...ds, ...ps];
}

/** Filtra; `label` dá o nome da ferramenta para a busca ("chaveiro" acha os projetos de Chaveiros). */
export function filterLibrary(items: LibraryItem[], f: Filters, label: (toolId: string) => string, now = Date.now()): LibraryItem[] {
  const q = norm(f.q.trim());
  return items.filter((it) => {
    if (f.toolId && it.toolId !== f.toolId) return false;
    if (f.period !== "all" && now - Date.parse(it.at) > Number(f.period) * DAY_MS) return false;
    if (it.kind === "draft") return !f.favorites && !f.tag && (!q || norm(`${it.name} ${label(it.toolId)}`).includes(q));
    if (f.favorites && !it.favorite) return false;
    if (f.tag && !it.tags.includes(f.tag)) return false;
    return !q || norm(`${it.name} ${label(it.toolId)} ${it.tags.join(" ")}`).includes(q);
  });
}

export const allTags = (items: LibraryItem[]) => [...new Set(items.flatMap((it) => (it.kind === "project" ? it.tags : [])))].sort((a, b) => a.localeCompare(b, "pt-BR"));
