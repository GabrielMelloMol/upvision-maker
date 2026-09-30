import { moveMesh, type ModelCtx } from "../../geometry/models/common";
import { drawerPlan, GRID, type DrawerAlign, type DrawerPlan } from "../../geometry/models/gridDrawer";
import { buildGridBase, buildGridBin, DEFAULT_GRID_BIN } from "../../geometry/models/gridfinity";
import type { Model } from "../../geometry/types";
import { groupModules, type DrawerLayout, type DrawerModule } from "./layout";

/** Projeto do organizador de gaveta (#140): medidas, base e os módulos desenhados na grade. */
export type DrawerProject = {
  width: number;
  depth: number;
  height: number;
  align: DrawerAlign;
  baseMagnets: boolean;
  baseColor: string;
  bedMargin: number;
  layout: DrawerLayout;
};

export const LABEL_COLOR = "#f8f8f6";
export const LABEL_TEXT = "#1c1c1e";

export const planOf = (p: DrawerProject): DrawerPlan =>
  drawerPlan({ width: p.width, depth: p.depth, height: p.height, align: p.align, baseFloor: p.baseMagnets ? 3.2 : 0, bedMargin: p.bedMargin });

/** Nome curto do módulo: "Caixinha 2×1×3" (+ etiqueta). */
export const moduleName = (m: DrawerModule) => `Caixinha ${m.w}×${m.h}×${m.u}${m.label.trim() ? ` ${m.label.trim()}` : ""}`;

/** A peça impressa de um módulo (caixinha e, se houver texto, a etiqueta), no centro da origem. */
export function moduleModels(ctx: ModelCtx, m: DrawerModule): Model[] {
  const out = buildGridBin(ctx, {
    ...DEFAULT_GRID_BIN,
    unitsX: m.w,
    unitsY: m.h,
    unitsZ: m.u,
    dividersX: m.dividersX,
    dividersY: m.dividersY,
    scoop: m.scoop,
    labelTab: m.labelTab,
    label: m.labelTab ? m.label : "",
    lip: m.lip,
    magnets: m.magnets,
    screws: false,
    binColor: m.color,
    labelColor: LABEL_COLOR,
    textColor: LABEL_TEXT,
  });
  return out.models.map((x, i) => ({ ...x, name: i === 0 ? moduleName(m) : `Etiqueta ${m.label.trim()}` }));
}

export type DrawerBuild = { plan: DrawerPlan; preview: Model[]; basePieces: Model[]; groups: { module: DrawerModule; count: number; ids: string[]; models: Model[] }[]; warnings: string[] };

/**
 * Gaveta montada para a prévia (base inteira e cada módulo no seu lugar) e as peças para imprimir: pedaços da base
 * e um grupo por módulo diferente, com a quantidade. Módulos iguais são gerados uma vez só.
 */
export function buildDrawer(ctx: ModelCtx, p: DrawerProject): DrawerBuild {
  const plan = planOf(p);
  const warnings = [...plan.notes];
  if (!plan.nx || !plan.ny) return { plan, preview: [], basePieces: [], groups: [], warnings };
  const baseParams = { unitsX: 1, unitsY: 1, magnets: p.baseMagnets, color: p.baseColor, mode: "drawer" as const, drawerW: p.width, drawerD: p.depth, drawerH: p.height, align: p.align, bedMargin: p.bedMargin };
  const assembled = buildGridBase(ctx, { ...baseParams, pieceGap: 0 }).models;
  const basePieces = buildGridBase(ctx, baseParams).models;
  const totalW = plan.nx * GRID + plan.marginX[0] + plan.marginX[1], totalD = plan.ny * GRID + plan.marginY[0] + plan.marginY[1];
  const floor = p.baseMagnets ? 3.2 : 0;
  const groups = groupModules(p.layout.modules).map((g) => ({ ...g, models: moduleModels(ctx, g.module) }));
  const preview: Model[] = [...assembled];
  for (const m of p.layout.modules) {
    const bin = groups.find((g) => g.ids.includes(m.id))!.models[0];
    const cx = plan.marginX[0] + (m.x + m.w / 2) * GRID - totalW / 2;
    const cy = plan.marginY[0] + (m.y + m.h / 2) * GRID - totalD / 2;
    preview.push({ ...bin, parts: bin.parts.map((q) => ({ ...q, mesh: moveMesh(q.mesh, cx, cy, floor) })) });
    if (m.u > plan.uMax) warnings.push(`${moduleName(m)} passa da altura da gaveta: cabe até ${plan.uMax} unidades.`);
  }
  return { plan, preview, basePieces, groups, warnings };
}
