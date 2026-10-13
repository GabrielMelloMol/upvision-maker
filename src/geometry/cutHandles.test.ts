import { describe, expect, test } from "vitest";
import { applyHandle, regionHandles, type PlaneRef } from "./cutHandles";
import type { Region } from "./cutRegion";

const plane: PlaneRef = { normal: [0, 0, 1], offset: 30 };
const box: Region = { kind: "box", min: [0, 0, 20], max: [20, 20, 50] };
const cyl: Region = { kind: "cylinder", center: [10, 10, 35], radius: 8, height: 30, axis: "z" };

describe("alças do corte parcial", () => {
  test("caixa: 6 faces, o centro e o plano; cada alça fica no meio da sua face", () => {
    const h = regionHandles(box, plane, [0, 0, 0]);
    expect(h.map((x) => x.id).sort()).toEqual(["max0", "max1", "max2", "min0", "min1", "min2", "move", "plane"].sort());
    expect(h.find((x) => x.id === "max2")!.pos).toEqual([10, 10, 50]);
    expect(h.find((x) => x.id === "plane")!.pos).toEqual([10, 10, 30]);
  });

  test("arrastar uma face muda só aquele lado e não passa do lado oposto", () => {
    const r = applyHandle(box, plane, "max0", [35, 5, 5]).region as Extract<Region, { kind: "box" }>;
    expect(r.max).toEqual([35, 20, 50]);
    expect(r.min).toEqual([0, 0, 20]);
    const squeezed = applyHandle(box, plane, "max0", [-9, 0, 0]).region as Extract<Region, { kind: "box" }>;
    expect(squeezed.max[0]).toBeCloseTo(0.5);
  });

  test("cilindro: raio, topo e base; o topo mexe no comprimento e no centro", () => {
    expect((applyHandle(cyl, plane, "r", [24, 10, 35]).region as Extract<Region, { kind: "cylinder" }>).radius).toBe(14);
    const top = applyHandle(cyl, plane, "top", [10, 10, 60]).region as Extract<Region, { kind: "cylinder" }>;
    expect(top.height).toBe(40);
    expect(top.center[2]).toBe(40);
  });

  test("esfera: alça do raio; mover leva o centro", () => {
    const s: Region = { kind: "sphere", center: [10, 10, 10], radius: 4 };
    expect((applyHandle(s, plane, "r", [20, 10, 10]).region as Extract<Region, { kind: "sphere" }>).radius).toBe(10);
    const moved = applyHandle(s, plane, "move", [0, 0, 0]).region as Extract<Region, { kind: "sphere" }>;
    expect(moved.center).toEqual([0, 0, 0]);
  });

  test("a alça do plano muda a posição ao longo da normal (também inclinado)", () => {
    expect(applyHandle(box, plane, "plane", [10, 10, 41]).offset).toBe(41);
    const tilted: PlaneRef = { normal: [Math.SQRT1_2, 0, Math.SQRT1_2], offset: 10 };
    expect(applyHandle(box, tilted, "plane", [10, 0, 10]).offset).toBeCloseTo(Math.SQRT1_2 * 20);
  });

  test("sem região só há a alça do plano", () => {
    expect(regionHandles(null, plane, [5, 5, 5]).map((x) => x.id)).toEqual(["plane"]);
    expect(applyHandle(null, plane, "move", [0, 0, 0]).region).toBeNull();
  });
});
