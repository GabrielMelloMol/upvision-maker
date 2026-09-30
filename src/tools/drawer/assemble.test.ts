import { beforeAll, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../../geometry/bounds";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import type { ModelCtx } from "../../geometry/models/common";
import { buildDrawer, type DrawerProject } from "./assemble";
import { addModule, updateModules, type DrawerLayout } from "./layout";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.length, h], true) : null) });

// gaveta de 4 × 3 casas exatas (168 + 1 de folga, 126 + 1)
function project(): DrawerProject {
  let l: DrawerLayout = { cols: 4, rows: 3, modules: [] };
  l = addModule(l, { x: 0, y: 0, w: 2, h: 1 })!;
  l = addModule(l, { x: 2, y: 0, w: 1, h: 1 })!;
  l = addModule(l, { x: 3, y: 0, w: 1, h: 1 })!;
  return { width: 169, depth: 127, height: 60, align: "center", baseMagnets: false, baseColor: "#1c1c1e", bedMargin: 4, layout: l };
}

test("gaveta 4 × 3 com 3 módulos: base inteira na prévia, módulos no lugar, iguais agrupados (#140)", () => {
  const out = buildDrawer(ctx(), project());
  expect([out.plan.nx, out.plan.ny]).toEqual([4, 3]);
  expect(out.basePieces).toHaveLength(1);
  expect(out.preview).toHaveLength(4); // base + 3 caixinhas
  expect(out.groups.map((g) => [g.module.w, g.count])).toEqual([[2, 1], [1, 2]]);
  // a caixinha 2×1 fica no canto da frente à esquerda: x de −84 a 0 (base centrada), y de −63 a −21
  const b = meshBounds(out.preview[1].parts.map((p) => p.mesh))!;
  expect(b.min[0]).toBeCloseTo(-84 + 0.25, 1);
  expect(b.max[0]).toBeCloseTo(0 - 0.25, 1);
  expect(b.min[1]).toBeCloseTo(-63 + 0.25, 1);
  expect(modelsBounds(out.preview)!.max[0]).toBeCloseTo(84, 1);
});

test("módulo mais alto que a gaveta avisa; etiqueta com texto vira peça à parte", () => {
  const p = project();
  const id = p.layout.modules[0].id;
  const out = buildDrawer(ctx(), { ...p, height: 30, layout: updateModules(p.layout, [id], { u: 5, label: "Pregos" }) });
  expect(out.warnings.join(" ")).toMatch(/passa da altura da gaveta: cabe até 3 unidades/);
  expect(out.groups[0].models.map((m) => m.name)).toEqual(["Caixinha 2×1×5 Pregos", "Etiqueta Pregos"]);
});
