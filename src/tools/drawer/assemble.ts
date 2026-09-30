import { moveMesh, solidMesh, type ModelCtx } from "../../geometry/models/common";
import { buildRails, buildRailTest, buildTray, railUpright } from "../../geometry/models/cutlery";
import { cutleryPlan, type CutleryPlan } from "../../geometry/models/cutleryPlan";
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
  /** Talheres em 2 andares: bandeja em cima, nos trilhos; base e caixinhas embaixo (#140, entrega extra). */
  cutlery?: boolean;
  /** Trilho metálico ou parafuso saindo de cada lateral (mm): tira da largura útil. */
  sideObstacle?: number;
  trayColor?: string;
};

export const LABEL_COLOR = "#f8f8f6";
export const LABEL_TEXT = "#1c1c1e";

export const TRAY_COLOR = "#2563eb";

/** Plano dos talheres, só quando ligado e a gaveta comporta 2 andares. */
export function cutleryOf(p: DrawerProject): CutleryPlan | null {
  if (!p.cutlery) return null;
  const c = cutleryPlan({ width: p.width, depth: p.depth, height: p.height, sideObstacle: p.sideObstacle ?? 0 });
  return c.levels === 2 ? c : null;
}

/** Espaço da base Gridfinity: entre os trilhos e até o apoio da bandeja com talheres; senão a gaveta menos os obstáculos. */
export function baseSpace(p: DrawerProject): { width: number; height: number } {
  const c = cutleryOf(p);
  return c ? { width: c.baseWidth, height: c.lowerHeight } : { width: p.width - 2 * (p.sideObstacle ?? 0), height: p.height };
}

export const planOf = (p: DrawerProject): DrawerPlan => {
  const b = baseSpace(p);
  return drawerPlan({ width: b.width, depth: p.depth, height: b.height, align: p.align, baseFloor: p.baseMagnets ? 3.2 : 0, bedMargin: p.bedMargin });
};

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

export type DrawerBuild = {
  plan: DrawerPlan;
  preview: Model[];
  /** Bandejas na posição montada (a cena anima à parte). */
  trays: Model[];
  basePieces: Model[];
  groups: { module: DrawerModule; count: number; ids: string[]; models: Model[] }[];
  /** Bandejas, trilhos e a peça de teste do trilho, para imprimir. */
  extras: Model[];
  cutlery: CutleryPlan | null;
  warnings: string[];
};

/**
 * Gaveta montada para a prévia (base inteira e cada módulo no seu lugar) e as peças para imprimir: pedaços da base
 * e um grupo por módulo diferente, com a quantidade. Módulos iguais são gerados uma vez só.
 */
export function buildDrawer(ctx: ModelCtx, p: DrawerProject): DrawerBuild {
  const plan = planOf(p);
  const warnings = [...plan.notes];
  const cutlery = cutleryOf(p);
  if (p.cutlery) warnings.push(...cutleryPlan({ width: p.width, depth: p.depth, height: p.height, sideObstacle: p.sideObstacle ?? 0 }).notes);
  if (!plan.nx || !plan.ny) return { plan, preview: [], trays: [], basePieces: [], groups: [], extras: [], cutlery, warnings };
  const space = baseSpace(p);
  const baseParams = { unitsX: 1, unitsY: 1, magnets: p.baseMagnets, color: p.baseColor, mode: "drawer" as const, drawerW: space.width, drawerD: p.depth, drawerH: space.height, align: p.align, bedMargin: p.bedMargin };
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
  const { trays, extras } = cutlery ? cutleryPieces(ctx, p, cutlery, preview) : { trays: [], extras: [] };
  return { plan, preview, trays, basePieces, groups, extras, cutlery, warnings };
}

/** Trilhos em pé na prévia, bandejas montadas em cima e as peças de imprimir (bandejas, trilhos cortados, teste). */
function cutleryPieces(ctx: ModelCtx, p: DrawerProject, c: CutleryPlan, preview: Model[]): { trays: Model[]; extras: Model[] } {
  const { M } = ctx;
  const color = p.trayColor ?? TRAY_COLOR;
  const inner = c.innerWidth, D = p.depth;
  for (const side of [-1, 1]) {
    const up = railUpright(M, D - 2, c.lowerHeight);
    const turned = side < 0 ? up : up.mirror([1, 0, 0]);
    const placed = turned.translate([side * (inner / 2), D / 2 - 1, 0]);
    preview.push({ name: side < 0 ? "Trilho esquerdo" : "Trilho direito", parts: [{ name: "Trilho", color: p.baseColor, mesh: solidMesh(placed) }] });
    for (const x of new Set([up, turned, placed])) x.delete();
  }
  const built = c.trays.map((t, i) => ({ t, m: { ...buildTray(M, t, c.trayDepth, c.trayHeight, color), name: i === 0 ? "Bandeja de talheres" : `Bandeja ${i + 1}` } }));
  const total = c.trays.reduce((a, t) => a + t.width, 0);
  let x = -total / 2;
  const trays = built.map(({ t, m }) => {
    const placed = { ...m, parts: m.parts.map((q) => ({ ...q, mesh: moveMesh(q.mesh, x, -D / 2 + 1, c.lowerHeight) })) };
    x += t.width;
    return placed;
  });
  const extras = [...built.map((b) => b.m), ...buildRails(M, D, c.lowerHeight, p.baseColor), ...buildRailTest(M, c.lowerHeight, color)];
  return { trays, extras };
}
