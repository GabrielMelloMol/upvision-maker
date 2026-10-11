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
  /** Caixinha sem grade: medida livre em mm (sem pés Gridfinity); w × h acima é só o espaço que ela ocupa no mapa. */
  freeW?: number;
  freeD?: number;
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

/** Primeiro lugar livre (da frente para o fundo, da esquerda para a direita) para um w×h: nas casas inteiras e, se não houver, em meia casa. */
export function freeSpot(l: DrawerLayout, w: number, h: number): Rect | null {
  for (const step of [1, 0.5])
    for (let y = 0; y + h <= l.rows; y += step) for (let x = 0; x + w <= l.cols; x += step) if (canPlace(l, { x, y, w, h })) return { x, y, w, h };
  return null;
}

/** Espaço (em casas, múltiplo de meia casa) que uma caixinha de `mm` ocupa no mapa, com a folga de 0,5 mm. */
export const footprint = (mm: number) => Math.max(0.5, Math.ceil(((mm + BIN_GAP) / GRID) * 2) / 2);

/** Caixinha sem grade: medida em mm; o espaço no mapa cresce junto (recusa se bater em outra). Sem medida (`null`), volta ao tamanho em casas. */
export function setFree(l: DrawerLayout, id: string, size: { w: number; d: number } | null): DrawerLayout {
  const m = l.modules.find((x) => x.id === id);
  if (!m) return l;
  const next: DrawerModule = size ? { ...m, freeW: size.w, freeD: size.d, w: footprint(size.w), h: footprint(size.d) } : { ...m, freeW: undefined, freeD: undefined, cutsX: undefined, cutsY: undefined };
  return canPlace(l, next, [id]) ? { ...l, modules: l.modules.map((x) => (x.id === id ? next : x)) } : l;
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

export type Paste = { layout: DrawerLayout; placed: number; skipped: number };

/**
 * Cola cópias dos módulos: o grupo inteiro, com as posições relativas, no primeiro lugar onde cabe; se não couber
 * junto, cada um no primeiro lugar livre. O que não coube é contado em `skipped`.
 */
export function pasteModules(l: DrawerLayout, copies: DrawerModule[]): Paste {
  if (!copies.length) return { layout: l, placed: 0, skipped: 0 };
  const x0 = Math.min(...copies.map((m) => m.x)), y0 = Math.min(...copies.map((m) => m.y));
  const gw = Math.max(...copies.map((m) => m.x + m.w)) - x0, gh = Math.max(...copies.map((m) => m.y + m.h)) - y0;
  const fits = (dx: number, dy: number) => copies.every((m, i) => canPlace(l, { ...m, x: m.x - x0 + dx, y: m.y - y0 + dy }) && copies.every((o, j) => j <= i || !overlaps({ ...m, x: m.x - x0 + dx, y: m.y - y0 + dy }, { ...o, x: o.x - x0 + dx, y: o.y - y0 + dy })));
  for (const step of [1, 0.5])
    for (let dy = 0; dy + gh <= l.rows; dy += step)
      for (let dx = 0; dx + gw <= l.cols; dx += step)
        if (fits(dx, dy)) return { layout: { ...l, modules: [...l.modules, ...copies.map((m) => ({ ...m, x: m.x - x0 + dx, y: m.y - y0 + dy, id: newId() }))] }, placed: copies.length, skipped: 0 };
  let out = l, placed = 0;
  for (const m of copies) {
    const spot = freeSpot(out, m.w, m.h);
    if (spot) {
      out = { ...out, modules: [...out.modules, { ...m, ...spot, id: newId() }] };
      placed++;
    }
  }
  return { layout: out, placed, skipped: copies.length - placed };
}

export type LayoutReport = { collisions: [string, string][]; outside: string[]; freeCells: number };

/** Confere o mapa: módulos que se sobrepõem ou saem da gaveta, e quantas casas ficam sem caixinha (em casas inteiras, contando meias). */
export function layoutReport(l: DrawerLayout): LayoutReport {
  const collisions: [string, string][] = [];
  l.modules.forEach((a, i) => l.modules.slice(i + 1).forEach((b) => overlaps(a, b) && collisions.push([a.id, b.id])));
  const outside = l.modules.filter((m) => !inside(l, m)).map((m) => m.id);
  let covered = 0;
  for (let hy = 0; hy < l.rows * 2; hy++)
    for (let hx = 0; hx < l.cols * 2; hx++) {
      const c = { x: hx / 2, y: hy / 2, w: 0.5, h: 0.5 };
      if (l.modules.some((m) => overlaps(m, c))) covered++;
    }
  return { collisions, outside, freeCells: (l.cols * l.rows * 4 - covered) / 4 };
}

export function removeModules(l: DrawerLayout, ids: string[]): DrawerLayout {
  return { ...l, modules: l.modules.filter((m) => !ids.includes(m.id)) };
}

/** Grade nova (gaveta mudou de medida): os módulos que não cabem mais saem. */
export function resizeGrid(l: DrawerLayout, cols: number, rows: number): DrawerLayout {
  const g = { cols, rows, modules: [] as DrawerModule[] };
  return { ...g, modules: l.modules.filter((m) => inside(g, m)) };
}

const shapeKey = ({ w, h, u, dividersX, dividersY, cutsX, cutsY, freeW, freeD, scoop, labelTab, label, lip, magnets, color, x, y }: DrawerModule) =>
  JSON.stringify([w, h, u, dividersX, dividersY, cutsX ?? null, cutsY ?? null, freeW ?? null, freeD ?? null, scoop, labelTab, label.trim(), lip, magnets, color.toLowerCase(), onGrid({ x, y })]);

/** A caixinha cai nas casas da base (posição inteira): só então leva os pés Gridfinity. */
export const onGrid = ({ x, y, freeW }: { x: number; y: number; freeW?: number }) => freeW === undefined && Number.isInteger(x) && Number.isInteger(y);

/** Menor compartimento (mm de vão livre) que o editor deixa criar. */
export const MIN_COMPARTMENT = 8;
const WALL = 1.2; // parede padrão da caixinha (DEFAULT_GRID_BIN)

export type Axis = "x" | "y";
/** Tamanho externo (mm) da caixinha: o livre, se tiver, ou as casas menos a folga. */
export const sizeOf = (m: Rect & { freeW?: number; freeD?: number }, axis: Axis) => (axis === "x" ? (m.freeW ?? m.w * GRID - BIN_GAP) : (m.freeD ?? m.h * GRID - BIN_GAP));
/** Vão interno (mm) da caixinha em cada direção. */
export const innerSize = (m: Rect & { freeW?: number; freeD?: number }, axis: Axis) => sizeOf(m, axis) - 2 * WALL;
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
