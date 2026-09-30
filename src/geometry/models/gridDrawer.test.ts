import { expect, test } from "vitest";
import { binHeight, drawerPlan, splitAxis, uMax } from "./gridDrawer";

test("gaveta de 500 × 420 × 80: 11 × 9 casas, margem igual dos dois lados, 6 pedaços, até 10 unidades (#140)", () => {
  const p = drawerPlan({ width: 500, depth: 420, height: 80 });
  expect([p.nx, p.ny]).toEqual([11, 9]);
  expect(p.marginX[0]).toBeCloseTo(18.5, 3);
  expect(p.marginX[1]).toBeCloseTo(18.5, 3);
  expect(p.marginY).toEqual([20.5, 20.5]);
  expect(p.piecesX.reduce((a, b) => a + b, 0)).toBe(11);
  expect(p.piecesX).toHaveLength(3);
  expect(p.piecesY).toHaveLength(2);
  expect(p.pieces).toBe(6);
  expect(p.uMax).toBe(10);
  // sobra ≥ 21 mm: dá meia casa em Y (41 mm), não em X (37 mm ≥ 21 também)
  expect(p.halfX).toBe(true);
  expect(p.halfY).toBe(true);
});

test("encostar: toda a sobra num lado só (direita e fundo)", () => {
  const p = drawerPlan({ width: 500, depth: 420, height: 80, align: "corner" });
  expect(p.marginX[0]).toBe(0);
  expect(p.marginX[1]).toBeCloseTo(37, 3);
  expect(p.marginY).toEqual([0, 41]);
});

test("margem fina (< 2 mm) não é gerada: vira folga com aviso", () => {
  const p = drawerPlan({ width: 169.5, depth: 85, height: 50 }); // 4 casas + 1,5 − 1 de folga = 0,5 de sobra
  expect(p.nx).toBe(4);
  expect(p.marginX).toEqual([0, 0]);
  expect(p.notes.join(" ")).toMatch(/folga/);
});

test("pedaço de ponta conta a margem; 6 casas por pedaço na A1 (252 mm)", () => {
  expect(splitAxis(12, [0, 0], 256, 4)).toEqual([6, 6]);
  expect(splitAxis(6, [0, 0], 256, 4)).toEqual([6]);
  // 6 casas + 10 mm de margem passa de 252: vira 2 pedaços
  expect(splitAxis(6, [10, 0], 256, 4)).toHaveLength(2);
  for (const s of splitAxis(11, [18.5, 18.5], 256, 4)) expect(s).toBeLessThanOrEqual(6);
});

test("altura da caixinha e uMax com base de ímã e sem borda", () => {
  expect(binHeight(10, true, 0)).toBeCloseTo(74.4, 3);
  expect(uMax(80, true, 3.2)).toBe(9);
  expect(uMax(80, false, 0)).toBe(11);
  expect(uMax(10, true, 0)).toBe(0);
});
