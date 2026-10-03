import type { ToolOutline } from "../../organizer/types";
import { canPlace, freeSpot, moveModules, newModule, type DrawerLayout, type Rect } from "../../tools/drawer/layout";
import type { ManifoldToplevel } from "../manifold";
import type { Mesh, Model } from "../types";
import { moveMesh } from "./common";
import { BED_MARGIN, drawerPlan, GRID, HEIGHT_UNIT, planSummary, uMax, type DrawerPlan } from "./gridDrawer";
import { LIP_H } from "./gridfinity";
import { buildGridBase } from "./gridfinity";
import { binCells, missingNote, toolBin, type ToolFitParams } from "./toolFit";

/**
 * Gaveta modular do Organizador pela foto (#169): uma caixinha Gridfinity por ferramenta, arrumadas na grade da
 * gaveta (dá para arrastar), sobre a base pela gaveta do Organizador de gaveta (#140), em pedaços que cabem na mesa.
 */
export type BinPlace = { x: number; y: number; turned: boolean };
export type BinSize = { id: string; w: number; h: number };
type Places = Record<string, BinPlace>;

/** Grade da gaveta (casas, margens, altura máxima em unidades) para as medidas da tela. */
export const modularPlan = (p: ToolFitParams): DrawerPlan =>
  drawerPlan({ width: p.drawerW, depth: p.drawerD, height: p.drawerH, align: "center", baseFloor: 0, bedMargin: BED_MARGIN });

/** Retângulo na grade (casas) que a caixinha ocupa nessa posição: deitada troca largura e fundo. */
export const footprint = (s: BinSize, pl: BinPlace): Rect => ({ x: pl.x, y: pl.y, w: pl.turned ? s.h : s.w, h: pl.turned ? s.w : s.h });

function layoutOf(cols: number, rows: number, sizes: BinSize[], places: Places): DrawerLayout {
  const modules = sizes.filter((s) => places[s.id]).map((s) => ({ ...newModule(footprint(s, places[s.id]), 1), id: s.id }));
  return { cols, rows, modules };
}

/**
 * Arrumação: as posições salvas (arrastadas) que ainda cabem ficam; as outras caixinhas, da maior para a menor, vão
 * no primeiro lugar livre (da frente para o fundo), deitadas se só assim couberem.
 */
export function placeBins(cols: number, rows: number, sizes: BinSize[], saved: Places): { places: Places; missing: string[] } {
  let places: Places = {};
  const add = (s: BinSize, pl: BinPlace) => (places = { ...places, [s.id]: pl });
  for (const s of sizes) {
    const pl = saved[s.id];
    if (pl && canPlace(layoutOf(cols, rows, sizes, places), footprint(s, pl))) add(s, pl);
  }
  const missing: string[] = [];
  const rest = sizes.filter((s) => !places[s.id]).sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h));
  for (const s of rest) {
    const l = layoutOf(cols, rows, sizes, places);
    const flat = freeSpot(l, s.w, s.h);
    const stood = flat ? null : freeSpot(l, s.h, s.w);
    if (flat) add(s, { x: flat.x, y: flat.y, turned: false });
    else if (stood) add(s, { x: stood.x, y: stood.y, turned: true });
    else missing.push(s.id);
  }
  return { places, missing };
}

/** Arrasta uma caixinha `dx`×`dy` casas; batendo em outra ou saindo da grade, nada muda. */
export function moveBin(cols: number, rows: number, sizes: BinSize[], places: Places, id: string, dx: number, dy: number): Places {
  const l = layoutOf(cols, rows, sizes, places);
  const moved = moveModules(l, [id], dx, dy);
  if (moved === l || !places[id]) return places;
  const m = moved.modules.find((x) => x.id === id)!;
  return { ...places, [id]: { ...places[id], x: m.x, y: m.y } };
}

/** Gira 90° em torno do centro (eixo z), para a caixinha deitada na prévia montada. */
function turn(mesh: Mesh): Mesh {
  const positions = mesh.positions.slice();
  for (let i = 0; i < positions.length; i += 3) [positions[i], positions[i + 1]] = [-mesh.positions[i + 1], mesh.positions[i]];
  return { ...mesh, positions };
}

export type ModularDrawer = {
  plan: DrawerPlan;
  sizes: BinSize[];
  places: Places;
  missing: string[];
  /** Base montada e cada caixinha no seu lugar. */
  preview: Model[];
  /** Pedaços da base (cada um cabe na mesa), para imprimir. */
  basePieces: Model[];
  /** Uma caixinha por ferramenta, no centro, para imprimir. */
  bins: Model[];
  groups: { count: number; models: Model[] }[];
  /** O que pede ação: não coube, passa da altura da gaveta. */
  warnings: string[];
  /** Informação: casas, margens, quantos pedaços de base. */
  notes: string[];
};

export function buildModularDrawer(M: ManifoldToplevel, tools: ToolOutline[], p: ToolFitParams, saved: Places): ModularDrawer {
  const plan = modularPlan(p);
  const sizes = tools.map((t) => ({ id: t.id, ...binCells(t, p) }));
  const { places, missing } = plan.nx && plan.ny ? placeBins(plan.nx, plan.ny, sizes, saved) : { places: {}, missing: tools.map((t) => t.id) };
  const warnings: string[] = [];
  const notes = [...plan.notes];
  if (!plan.nx || !plan.ny) return { plan, sizes, places, missing, preview: [], basePieces: [], bins: [], groups: [], warnings: ["A gaveta é menor que uma casa de 42 mm."], notes };
  notes.push(planSummary(plan, false, 0));
  const ctx = { M, art: null, text: () => null };
  const baseParams = { unitsX: 1, unitsY: 1, magnets: false, color: p.color, mode: "drawer" as const, drawerW: p.drawerW, drawerD: p.drawerD, drawerH: p.drawerH, align: "center" as const, bedMargin: BED_MARGIN };
  const assembled = buildGridBase(ctx, { ...baseParams, pieceGap: 0 }).models;
  const basePieces = buildGridBase(ctx, baseParams).models;
  const totalW = plan.nx * GRID + plan.marginX[0] + plan.marginX[1], totalD = plan.ny * GRID + plan.marginY[0] + plan.marginY[1];
  // altura: niveladas pela mais alta (padrão), todas pela gaveta, ou cada uma pelo seu encaixe
  const fits = uMax(p.drawerH, p.lip, 0);
  const tallest = Math.max(1, ...sizes.map((s) => s.u));
  const common = p.binHeight === "drawer" ? Math.max(fits, tallest) : tallest;
  const unitsOf = (id: string) => (p.binHeight === "each" ? sizes.find((s) => s.id === id)!.u : common);
  const bins: Model[] = [];
  const preview: Model[] = [...assembled];
  const highest = Math.max(0, ...tools.filter((t) => places[t.id]).map((t) => unitsOf(t.id)));
  if (highest > fits) {
    const mm = highest * HEIGHT_UNIT + (p.lip ? LIP_H : 0);
    warnings.push(`Caixinhas de ${highest} unidades (${mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm${p.lip ? " com a borda" : ""}) passam da altura da gaveta: cabem até ${fits} unidades. Diminua a profundidade${p.lip ? " ou desligue a borda de empilhar" : ""}.`);
  }
  for (const t of tools) {
    const pl = places[t.id];
    if (!pl) continue;
    const s = sizes.find((x) => x.id === t.id)!;
    const { model } = toolBin(M, t, p, unitsOf(t.id));
    bins.push(model);
    const r = footprint(s, pl);
    const cx = plan.marginX[0] + (r.x + r.w / 2) * GRID - totalW / 2, cy = plan.marginY[0] + (r.y + r.h / 2) * GRID - totalD / 2;
    preview.push({ ...model, parts: model.parts.map((q) => ({ ...q, mesh: moveMesh(pl.turned ? turn(q.mesh) : q.mesh, cx, cy) })) });
  }
  warnings.push(...missingNote(missing, tools, "na gaveta"));
  return { plan, sizes, places, missing, preview, basePieces, bins, groups: bins.map((m) => ({ count: 1, models: [m] })), warnings, notes };
}
