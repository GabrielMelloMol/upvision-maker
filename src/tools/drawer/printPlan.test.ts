import { beforeAll, expect, test } from "vitest";
import { modelsBounds } from "../../geometry/bounds";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import type { ModelCtx } from "../../geometry/models/common";
import { buildDrawer, type DrawerProject } from "./assemble";
import { addModule, type DrawerLayout } from "./layout";
import { drawerPrint, instances } from "./printPlan";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: () => null });

function project(width: number, depth: number): DrawerProject {
  let l: DrawerLayout = { cols: 11, rows: 9, modules: [] };
  for (const x of [0, 1, 2, 3]) l = addModule(l, { x, y: 0, w: 1, h: 1 })!;
  l = addModule(l, { x: 0, y: 1, w: 3, h: 2 })!;
  return { width, depth, height: 80, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: l };
}

test("lista de impressão: uma linha por peça diferente com quantidade; total = soma das mesas (#140)", () => {
  const b = buildDrawer(ctx(), project(500, 420));
  const plan = drawerPrint(b.basePieces, b.groups);
  const names = plan.rows.map((r) => [r.name, r.count]);
  expect(names.filter(([n]) => String(n).startsWith("Base"))).toHaveLength(6);
  expect(names).toContainEqual(["Caixinha 1×1×3", 4]);
  expect(names).toContainEqual(["Caixinha 3×2×3", 1]);
  // mesas: todas as instâncias, nenhuma passa de 256 mm; total bate com a soma das mesas e das linhas
  expect(plan.plates.flatMap((p) => p.models)).toHaveLength(instances(b.basePieces, b.groups).length);
  for (const p of plan.plates) {
    const bb = modelsBounds(p.models)!;
    expect(bb.max[0]).toBeLessThanOrEqual(256 + 1e-6);
    expect(bb.max[1]).toBeLessThanOrEqual(256 + 1e-6);
    expect(bb.min[0]).toBeGreaterThanOrEqual(0);
  }
  const sum = (xs: { grams: number }[]) => xs.reduce((s, x) => s + x.grams, 0);
  expect(sum(plan.plates)).toBeCloseTo(plan.grams, 0);
  expect(sum(plan.rows)).toBeCloseTo(plan.grams, 0);
  expect(plan.seconds).toBeGreaterThan(0);
});
