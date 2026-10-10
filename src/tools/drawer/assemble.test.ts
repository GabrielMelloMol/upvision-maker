import { beforeAll, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../../geometry/bounds";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import type { ModelCtx } from "../../geometry/models/common";
import { buildDrawer, cutleryBlocked, planOf, type DrawerProject } from "./assemble";
import { drawerPrint } from "./printPlan";
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

test("talheres em 2 andares: base entre os trilhos, caixinhas até o apoio da bandeja, bandejas em cima e peças para imprimir (#140)", () => {
  const p = { ...project(), width: 500, depth: 500, height: 110, cutlery: true, layout: { cols: 11, rows: 11, modules: [] } };
  const out = buildDrawer(ctx(), p);
  expect(out.cutlery?.levels).toBe(2);
  expect(out.plan.nx).toBe(11); // 500 − 2 × 12 de trilho = 476 → 11 casas
  expect(out.plan.uMax).toBeLessThan(buildDrawer(ctx(), { ...p, cutlery: false }).plan.uMax);
  expect(out.preview.filter((m) => m.name.startsWith("Trilho")).map((m) => m.name)).toEqual(["Trilho esquerdo", "Trilho direito"]);
  expect(out.trays).toHaveLength(2);
  // a bandeja fica em cima do andar de baixo, dentro da gaveta
  const tb = modelsBounds(out.trays)!;
  expect(tb.min[2]).toBeCloseTo(out.cutlery!.lowerHeight, 1);
  expect(tb.max[0] - tb.min[0]).toBeLessThanOrEqual(500);
  const names = out.extras.map((m) => m.name);
  expect(names).toContain("Bandeja de talheres");
  expect(names.filter((n) => n.startsWith("Trilho esquerdo")).length).toBeGreaterThanOrEqual(2);
  expect(names).toContain("Teste do trilho");
  expect(out.warnings.join(" ")).toMatch(/desliza/);
});

const floors = (out: ReturnType<typeof buildDrawer>) => {
  const pp = drawerPrint([...out.basePieces, ...out.extras], out.groups);
  const names = pp.plates.flatMap((pl) => pl.models.map((m) => m.name));
  return {
    base: names.filter((n) => /^Base/.test(n)).length,
    bins: names.filter((n) => /^Caixinha/.test(n)).length,
    upper: names.filter((n) => /^(Bandeja|Trilho|Teste)/.test(n)).length,
  };
};

test("dois andares ligado: o andar de baixo (base + caixinhas) está na prévia e na mesa de impressão, junto com o de cima (bug do Gabriel)", () => {
  const sized = { ...project(), width: 500, depth: 420, height: 110, cutlery: true };
  const plan = planOf(sized);
  let layout: DrawerLayout = { cols: plan.nx, rows: plan.ny, modules: [] };
  layout = addModule(layout, { x: 0, y: 0, w: 2, h: 2 })!;
  layout = addModule(layout, { x: 2, y: 0, w: 2, h: 2 })!;
  const out = buildDrawer(ctx(), { ...sized, layout });
  expect(cutleryBlocked({ ...sized, layout })).toBeNull();
  expect(out.preview.filter((m) => /^Base/.test(m.name)).length).toBeGreaterThan(0);
  expect(out.preview.filter((m) => /^Caixinha/.test(m.name))).toHaveLength(2);
  const f = floors(out);
  expect(f.base).toBe(out.basePieces.length);
  expect(f.bins).toBeGreaterThan(0);
  expect(f.upper).toBeGreaterThan(0);
});

test.each([79, 60, 45])("dois andares com altura %i mm: avisa por que não cabe, com mínimo em mm e cm, em vez de ignorar", (height) => {
  const p = { ...project(), height, cutlery: true };
  const why = cutleryBlocked(p)!;
  expect(why).toMatch(/80 mm \(8 cm\)/);
  expect(why).toContain(`${height} mm`);
  expect(why).toMatch(/faltam/);
  expect(buildDrawer(ctx(), p).warnings).toContain(why);
});
