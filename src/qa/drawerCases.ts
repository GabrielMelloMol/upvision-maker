import type { ManifoldToplevel } from "../geometry/manifold";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import { buildDrawer, planOf, type DrawerProject } from "../tools/drawer/assemble";
import { addModule, type DrawerLayout, type Rect } from "../tools/drawer/layout";
import { instances } from "../tools/drawer/printPlan";
import type { QaCase } from "./cases";

/*
 * Organizador de gaveta e talheres em 2 andares (#140) na varredura (#90): o mesmo conjunto de peças que a tela
 * salva (pedaços da base, caixinhas, bandejas, trilhos e peça de teste), nos limites dos campos da tela.
 */
const text = () => null;

function project(width: number, depth: number, height: number, mods: Rect[], cutlery = false): DrawerProject {
  const p: DrawerProject = { width, depth, height, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: { cols: 0, rows: 0, modules: [] }, cutlery };
  const plan = planOf(p);
  let layout: DrawerLayout = { cols: plan.nx, rows: plan.ny, modules: [] };
  for (const r of mods) layout = addModule(layout, r, plan.uMax) ?? layout;
  return { ...p, layout };
}

const SOME: Rect[] = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 1, y: 0, w: 1, h: 1 },
  { x: 2, y: 0, w: 2, h: 1 },
  { x: 0, y: 1, w: 3, h: 2 },
];

export function drawerCases(M: ManifoldToplevel): QaCase[] {
  const run = (p: DrawerProject) => async () => {
    const out = buildDrawer({ M, art: null, text }, p);
    return { models: instances([...out.basePieces, ...out.extras], out.groups), pauses: [], warnings: out.warnings };
  };
  const list: [string, string, string, () => Promise<{ models: import("../geometry/types").Model[]; pauses: number[]; warnings: string[] }>][] = [
    ["drawer", "Organizador de gaveta", "padrão", run(project(500, 420, 80, SOME))],
    ["drawer", "Organizador de gaveta", "mínimo", run(project(50, 50, 15, []))],
    ["drawer", "Organizador de gaveta", "máximo", run(project(1500, 1500, 400, [...SOME, { x: 5, y: 5, w: 6, h: 6 }]))],
    ["cutlery", "Talheres em 2 andares", "padrão", run(project(500, 500, 110, SOME, true))],
    ["cutlery", "Talheres em 2 andares", "mínimo", run(project(300, 280, 80, [], true))],
    ["cutlery", "Talheres em 2 andares", "máximo", run(project(1500, 1500, 400, SOME, true))],
  ];
  return list.map(([id, label, variant, build]) => ({ key: `${id}:${variant}`, owner: "Torno", group: "home", label: `${label} (ferramenta)`, variant, profile: DEFAULT_PROFILE, build }));
}
