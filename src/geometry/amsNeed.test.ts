import { beforeAll, describe, expect, test } from "vitest";
import { AMS_LABEL, amsNeed, platesByColor } from "./amsNeed";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import type { Model, Part } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** Bloco w × d × h com o canto em (x, 0, z). */
function block(color: string, x: number, z: number, w = 20, h = 2): Part {
  const s = M.Manifold.cube([w, 20, h]).translate([x, 0, z]);
  const mesh = toMesh(s);
  s.delete();
  return { name: color, color, mesh };
}
const model = (...parts: Part[]): Model[] => [{ name: "Peça", parts }];

describe("precisa de AMS? (#118)", () => {
  test("uma cor, cores empilhadas (troca manual) e cores lado a lado (AMS)", () => {
    expect(amsNeed(model(block("#FFF", 0, 0), block("#fff", 30, 0)))).toBe("uma-cor"); // mesma cor, maiúscula ou não
    expect(amsNeed(model(block("#fff", 0, 0), block("#000", 0, 2)))).toBe("troca-manual"); // letreiro em camadas
    expect(amsNeed(model(block("#fff", 0, 0), block("#000", 30, 0)))).toBe("ams"); // pixel art
    expect(AMS_LABEL.ams).toMatch(/Precisa de AMS/);
  });

  test("uma mesa por cor: cada cor sozinha, apoiada na mesa (Z = 0) e sem sobrepor", () => {
    const plates = platesByColor(model(block("#fff", 0, 0), block("#000", 0, 2), block("#000", 40, 2), block("#FFF", 80, 0)));
    expect(plates.map((p) => p.color)).toEqual(["#fff", "#000"]);
    const black = plates[1].models;
    expect(black).toHaveLength(2);
    for (const m of black) {
      expect(m.parts.every((p) => p.color === "#000")).toBe(true);
      expect(meshBounds(m.parts.map((p) => p.mesh))!.min[2]).toBeCloseTo(0, 5); // a camada de cima desceu para a mesa
    }
    const [a, b] = black.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    expect(a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[1] <= b.min[1] || b.max[1] <= a.min[1]).toBe(true);
  });
});
