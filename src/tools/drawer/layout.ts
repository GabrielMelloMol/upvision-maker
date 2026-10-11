import { BIN_GAP, dividerFractions, GRID } from "../../geometry/models/gridfinity";

/*
 * Módulos (caixinhas) na grade da gaveta (#140). Tudo em casas de 42 mm (posição e tamanho em múltiplos de meia casa,
 * 21 mm); x da esquerda, y da frente.
 * Funções puras: cada operação devolve um layout novo (ou o mesmo, se não couber).
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type DrawerModule = Rect & {
  id: string;
  u: number; // altura em unidades de 7 mm
  dividersX: number;
  dividersY: number;
  /** Posição livre das divisórias (fração 0–1 do vão interno); sem isso, iguais pela quantidade acima. */
  cutsX?: number[];
  cutsY?: number[];
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
const inside = (l: DrawerLayout, r: Rect) => r.w >= 0.5 && r.h >= 0.5 && r.x >= 0 && r.y >= 0 && r.x + r.w <= l.cols && r.y + r.h <= l.rows;

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
  const next = { ...m, w: Math.round(w * 2) / 2, h: Math.round(h * 2) / 2 };
  if (next.w < 0.5 || next.h < 0.5) return l; // mínimo: meia casa
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

const shapeKey = ({ w, h, u, dividersX, dividersY, cutsX, cutsY, scoop, labelTab, label, lip, magnets, color, x, y }: DrawerModule) =>
  JSON.stringify([w, h, u, dividersX, dividersY, cutsX ?? null, cutsY ?? null, scoop, labelTab, label.trim(), lip, magnets, color.toLowerCase(), onGrid({ x, y })]);

/** A caixinha cai nas casas da base (posição inteira): só então leva os pés Gridfinity. */
export const onGrid = ({ x, y }: { x: number; y: number }) => Number.isInteger(x) && Number.isInteger(y);

/** Menor compartimento (mm de vão livre) que o editor deixa criar. */
export const MIN_COMPARTMENT = 8;
const WALL = 1.2; // parede padrão da caixinha (DEFAULT_GRID_BIN)

export type Axis = "x" | "y";
/** Vão interno (mm) da caixinha em cada direção. */
export const innerSize = (m: Rect, axis: Axis) => (axis === "x" ? m.w : m.h) * GRID - BIN_GAP - 2 * WALL;
const cutsKey = (axis: Axis) => (axis === "x" ? "cutsX" : "cutsY") as "cutsX" | "cutsY";
const countKey = (axis: Axis) => (axis === "x" ? "dividersX" : "dividersY") as "dividersX" | "dividersY";

/** Posição de cada divisória em mm a partir da esquerda (x) ou da frente (y), no vão interno. */
export const dividerMm = (m: DrawerModule, axis: Axis): number[] =>
  dividerFractions(m[countKey(axis)], m[cutsKey(axis)]).map((f) => f * innerSize(m, axis));

/** Tamanhos (mm) dos compartimentos de uma direção, de uma ponta à outra. */
export function compartmentsMm(m: DrawerModule, axis: Axis): number[] {
  const inner = innerSize(m, axis);
  const at = [0, ...dividerMm(m, axis), inner];
  return at.slice(1).map((v, i) => v - at[i] - (i > 0 ? WALL / 2 : 0) - (i < at.length - 2 ? WALL / 2 : 0));
}

/** Patch que põe as divisórias de `axis` nas posições `mm` (do vão interno), mantendo cada compartimento >= MIN_COMPARTMENT. */
export function cutsPatch(m: DrawerModule, axis: Axis, mm: number[]): Partial<DrawerModule> {
  const inner = innerSize(m, axis);
  const step = MIN_COMPARTMENT + WALL;
  const sorted = [...mm].sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((v, i) => {
    const lo = i === 0 ? MIN_COMPARTMENT + WALL / 2 : out[i - 1] + step;
    const hi = inner - MIN_COMPARTMENT - WALL / 2 - (sorted.length - 1 - i) * step;
    out.push(Math.round(Math.min(hi, Math.max(lo, v)) * 2) / 2);
  });
  return { [cutsKey(axis)]: out.map((v) => v / inner), [countKey(axis)]: out.length + 1 };
}

/** Patch de quantidade: divisórias iguais (descarta as posições livres). */
export const evenCutsPatch = (axis: Axis, count: number): Partial<DrawerModule> => ({ [countKey(axis)]: count, [cutsKey(axis)]: undefined });

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
