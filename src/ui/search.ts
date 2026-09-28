import { ClipboardList, Cylinder, Package, Printer, ShoppingBag, Users, type LucideIcon } from "lucide-react";
import { customersRepo } from "../db/customersRepo";
import { ordersRepo } from "../db/ordersRepo";
import { STATUS_LABEL } from "../domain/orders";
import { productsRepo } from "../db/productsRepo";
import { filaments, materials, printers } from "../db/repo";
import type { Db } from "../db/types";

export type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** Seção da lista (Telas, Filamentos, Produtos…). */
  group: string;
  icon?: LucideIcon;
  /** Página que abre ao escolher. */
  pageId: string;
  /** Registro a abrir em modo edição na página (CrudPage lê com takePendingOpen). */
  recordId?: number;
  keywords?: string;
};

/**
 * Fontes de busca por dados (Cmd/Ctrl+K). Para incluir clientes, pedidos etc., acrescente uma função aqui.
 * Cada uma recebe o banco e devolve itens; erro numa fonte não derruba as outras.
 */
export const SEARCH_SOURCES: ((db: Db) => Promise<SearchItem[]>)[] = [
  async (db) =>
    (await filaments.list(db)).map((f) => ({
      id: `fil-${f.id}`,
      title: [f.material, f.color].filter(Boolean).join(" "),
      subtitle: [f.brand, `${f.stockG.toLocaleString("pt-BR")} g`].filter(Boolean).join(" · "),
      group: "Filamentos",
      icon: Cylinder,
      pageId: "filaments",
      recordId: f.id,
    })),
  async (db) =>
    (await materials.list(db)).map((m) => ({ id: `mat-${m.id}`, title: m.name, subtitle: m.unit, group: "Materiais extras", icon: Package, pageId: "materials", recordId: m.id })),
  async (db) =>
    (await printers.list(db)).map((p) => ({ id: `prn-${p.id}`, title: p.name, subtitle: `${p.watts} W`, group: "Impressoras", icon: Printer, pageId: "printers", recordId: p.id })),
  async (db) =>
    (await productsRepo.list(db)).map((p) => ({ id: `prd-${p.id}`, title: p.name, subtitle: p.sku || undefined, group: "Produtos", icon: ShoppingBag, pageId: "products", recordId: p.id, keywords: p.notes })),
  async (db) =>
    (await customersRepo.list(db)).map((c) => ({
      id: `cli-${c.id}`,
      title: c.name,
      subtitle: [c.phone, c.city].filter(Boolean).join(" · ") || undefined,
      group: "Clientes",
      icon: Users,
      pageId: "customers",
      recordId: c.id,
      keywords: [c.email, c.instagram, c.document].join(" "),
    })),
  async (db) =>
    (await ordersRepo.list(db)).map((o) => ({
      id: `ped-${o.id}`,
      title: `Pedido #${o.id} · ${o.customerName}`,
      subtitle: [STATUS_LABEL[o.status], o.dueDate && `prazo ${o.dueDate.split("-").reverse().join("/")}`].filter(Boolean).join(" · "),
      group: "Pedidos",
      icon: ClipboardList,
      pageId: "orders",
      recordId: o.id,
      keywords: o.items.map((i) => i.description).join(" "),
    })),
];

export async function loadSearchItems(db: Db): Promise<SearchItem[]> {
  const results = await Promise.allSettled(SEARCH_SOURCES.map((s) => s(db)));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Filtra por todas as palavras (sem acento) e ordena: começo do título > palavra no título > resto. */
export function rank(items: SearchItem[], query: string): SearchItem[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored = items.flatMap((it) => {
    const title = norm(it.title);
    const hay = `${title} ${norm(it.subtitle ?? "")} ${norm(it.keywords ?? "")} ${norm(it.group)}`;
    if (!words.every((w) => hay.includes(w))) return [];
    const score = title.startsWith(words[0]) ? 0 : title.split(/\s+/).some((t) => t.startsWith(words[0])) ? 1 : 2;
    return [{ it, score }];
  });
  return scored.sort((a, b) => a.score - b.score).map((s) => s.it);
}

let pending: { pageId: string; recordId: number } | null = null;
/** A busca pede para abrir um registro; a página consome ao montar. */
export const setPendingOpen = (p: { pageId: string; recordId: number } | null) => void (pending = p);
export function takePendingOpen(pageId: string): number | null {
  if (pending?.pageId !== pageId) return null;
  const id = pending.recordId;
  pending = null;
  return id;
}
