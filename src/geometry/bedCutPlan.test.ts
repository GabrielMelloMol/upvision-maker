import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { fitsBed, planCuts, planeFrame, usable, type Axis } from "./bedCutPlan";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const A1 = { x: 256, y: 256, z: 256 };

describe("plano de cortes para caber na mesa (#218)", () => {
  test("peça que já cabe: nenhum corte", () => expect(planCuts([200, 200, 100], A1, 4)).toEqual({ counts: [1, 1, 1], pieces: 1, fits: true }));

  test("peça comprida: corta só no comprimento, em partes iguais", () => {
    expect(planCuts([300, 200, 100], A1, 4).counts).toEqual([2, 1, 1]);
    expect(planCuts([100, 100, 600], A1, 4).counts).toEqual([1, 1, 3]);
  });

  test("pode deitar a peça: uma peça de 100 × 100 × 300 cabe em 2 pedaços de pé ou em 2 deitados, sem cortar em 3", () => {
    expect(planCuts([100, 100, 300], { x: 220, y: 220, z: 250 }, 4).pieces).toBe(2);
  });

  test("3 eixos: 600 × 300 × 100 vira 3 × 2 × 1", () => expect(planCuts([600, 300, 100], A1, 4).counts).toEqual([3, 2, 1]));

  test("mesa pequena demais: avisa que não cabe", () => expect(planCuts([5000, 5000, 5000], { x: 100, y: 100, z: 100 }, 4).fits).toBe(false));

  test("a margem tira da mesa, não da altura", () => expect(usable(A1, 5)).toEqual({ x: 246, y: 246, z: 256 }));
  test("cabe em qualquer orientação: o lado de 300 pode ficar de pé na mesa de 256 de altura", () => expect(fitsBed([300, 100, 100], { x: 100, y: 100, z: 300 })).toBe(true));

  test.each(["x", "y", "z"] as Axis[])("quadro do plano no eixo %s: ida e volta devolve o ponto e o eixo vira o w", (axis) => {
    const f = planeFrame(axis, 30);
    const cube = M.Manifold.cube([1, 1, 1], true).translate([10, 20, 30]); // um ponto reconhecível
    const local = cube.transform(f.toLocal).boundingBox();
    const w = { x: 10, y: 20, z: 30 }[axis];
    expect((local.min[2] + local.max[2]) / 2).toBeCloseTo(w - 30); // o w local é a distância ao plano ao longo do eixo
    const back = cube.transform(f.toLocal).transform(f.toWorld).boundingBox();
    expect([back.min[0], back.min[1], back.min[2]].map((v) => Math.round(v * 10) / 10)).toEqual([9.5, 19.5, 29.5]);
  });
});
