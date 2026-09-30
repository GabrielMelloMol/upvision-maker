/*
 * Módulos (caixinhas) na grade da gaveta (#140). Tudo em casas de 42 mm; x da esquerda, y da frente.
 * Funções puras: cada operação devolve um layout novo (ou o mesmo, se não couber).
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type DrawerModule = Rect & {
  id: string;
  u: number; // altura em unidades de 7 mm
  dividersX: number;
  dividersY: number;
  scoop: boolean;
  labelTab: boolean;
  label: string;
  lip: boolean;
  magnets: boolean;
  color: string;
};
export type DrawerLayout = { cols: number; rows: number; modules: DrawerModule[] };

const DEFAULT_U = 3;
let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newModule(r: Rect, uMax: number): DrawerModule {
  return { ...r, id: newId(), u: Math.max(1, Math.min(DEFAULT_U, uMax)), dividersX: 1, dividersY: 1, scoop: false, labelTab: true, label: "", lip: true, magnets: false, color: "#2563eb" };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (l: DrawerLayout, r: Rect) => r.w >= 1 && r.h >= 1 && r.x >= 0 && r.y >= 0 && r.x + r.w <= l.cols && r.y + r.h <= l.rows;

/** O retângulo cabe na grade sem encostar em módulos (fora os de `ignore`). */
export function canPlace(l: DrawerLayout, r: Rect, ignore: string[] = []): boolean {
  return inside(l, r) && l.modules.every((m) => ignore.includes(m.id) || !overlaps(m, r));
}

export function addModule(l: DrawerLayout, r: Rect, uMax = 10): DrawerLayout | null {
  return canPlace(l, r) ? { ...l, modules: [...l.modules, newModule(r, uMax)] } : null;
}

/** Move os módulos `ids` juntos; se algum sair da grade ou bater, nada muda. */
export function moveModules(l: DrawerLayout, ids: string[], dx: number, dy: number): DrawerLayout {
  const moved = l.modules.map((m) => (ids.includes(m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m));
  const ok = moved.filter((m) => ids.includes(m.id)).every((m) => canPlace({ ...l, modules: moved }, m, [m.id]));
  return ok && ids.length ? { ...l, modules: moved } : l;
}

export function resizeModule(l: DrawerLayout, id: string, w: number, h: number): DrawerLayout {
  const m = l.modules.find((x) => x.id === id);
  if (!m) return l;
  const next = { ...m, w, h };
  return canPlace(l, next, [id]) ? { ...l, modules: l.modules.map((x) => (x.id === id ? next : x)) } : l;
}

/** Muda campos (altura, divisórias, cor…) dos módulos `ids`. */
export function updateModules(l: DrawerLayout, ids: string[], patch: Partial<Omit<DrawerModule, "id" | "x" | "y" | "w" | "h">>): DrawerLayout {
  return { ...l, modules: l.modules.map((m) => (ids.includes(m.id) ? { ...m, ...patch } : m)) };
}

/** Primeiro lugar livre (da frente para o fundo, da esquerda para a direita) para um w×h. */
export function freeSpot(l: DrawerLayout, w: number, h: number): Rect | null {
  for (let y = 0; y + h <= l.rows; y++) for (let x = 0; x + w <= l.cols; x++) if (canPlace(l, { x, y, w, h })) return { x, y, w, h };
  return null;
}

/** Copia os módulos `ids`, cada cópia no primeiro lugar livre; os que não couberem ficam de fora. */
export function duplicate(l: DrawerLayout, ids: string[]): DrawerLayout {
  let out = l;
  for (const m of l.modules.filter((x) => ids.includes(x.id))) {
    const spot = freeSpot(out, m.w, m.h);
    if (spot) out = { ...out, modules: [...out.modules, { ...m, ...spot, id: newId() }] };
  }
  return out;
}

export function removeModules(l: DrawerLayout, ids: string[]): DrawerLayout {
  return { ...l, modules: l.modules.filter((m) => !ids.includes(m.id)) };
}

/** Grade nova (gaveta mudou de medida): os módulos que não cabem mais saem. */
export function resizeGrid(l: DrawerLayout, cols: number, rows: number): DrawerLayout {
  const g = { cols, rows, modules: [] as DrawerModule[] };
  return { ...g, modules: l.modules.filter((m) => inside(g, m)) };
}

const shapeKey = ({ w, h, u, dividersX, dividersY, scoop, labelTab, label, lip, magnets, color }: DrawerModule) =>
  JSON.stringify([w, h, u, dividersX, dividersY, scoop, labelTab, label.trim(), lip, magnets, color.toLowerCase()]);

/** Módulos iguais (mesma peça impressa) juntos, com a quantidade, na ordem em que aparecem. */
export function groupModules(modules: DrawerModule[]): { module: DrawerModule; count: number; ids: string[] }[] {
  const out = new Map<string, { module: DrawerModule; count: number; ids: string[] }>();
  for (const m of modules) {
    const k = shapeKey(m);
    const g = out.get(k);
    out.set(k, g ? { ...g, count: g.count + 1, ids: [...g.ids, m.id] } : { module: m, count: 1, ids: [m.id] });
  }
  return [...out.values()];
}
