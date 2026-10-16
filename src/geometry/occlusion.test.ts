import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { buildOccluder } from "./occlusion";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const occ = (s: ReturnType<ManifoldToplevel["Manifold"]["cube"]>) => {
  const m = s.getMesh();
  return buildOccluder(new Float32Array(m.vertProperties), new Uint32Array(m.triVerts));
};

describe("oclusão: o interior de uma cavidade (#222)", () => {
  const cup = () => M.Manifold.cylinder(80, 35, 35, 96).subtract(M.Manifold.cylinder(80, 32.6, 32.6, 96).translate([0, 0, 3]));

  test("copo: parede de fora e borda livres; parede de dentro e fundo de dentro muito ocluídos", () => {
    const o = occ(cup());
    expect(o.fraction([35, 0, 40], [1, 0, 0])).toBeLessThan(0.15); // parede de fora
    expect(o.fraction([33.8, 0, 80], [0, 0, 1])).toBeLessThan(0.15); // borda
    expect(o.fraction([-32.6, 0, 40], [1, 0, 0])).toBeGreaterThan(0.7); // parede de dentro (a normal aponta para o eixo)
    expect(o.fraction([0, 0, 3], [0, 0, 1])).toBeGreaterThan(0.6); // fundo de dentro
    expect(o.fraction([-32.6, 0, 70], [1, 0, 0])).toBeGreaterThan(0.5); // parede de dentro a 10 mm da borda
    expect(o.fraction([35, 0, 72], [1, 0, 0])).toBeLessThan(0.15); // parede de fora perto da borda
  });

  test("peça maciça (caixa e esfera): nada é interior", () => {
    const b = occ(M.Manifold.cube([40, 40, 30], false));
    expect(b.fraction([40, 20, 15], [1, 0, 0])).toBe(0);
    expect(b.fraction([20, 20, 30], [0, 0, 1])).toBe(0);
    expect(occ(M.Manifold.sphere(20, 48)).fraction([20, 0, 0], [1, 0, 0])).toBe(0);
  });

  test("caneca com alça: a volta de fora da alça é livre; o lado de dentro do vão (de frente para o corpo) conta como fechado", () => {
    const handle = M.CrossSection.circle(5.5, 32).translate([22, 0]).revolve(64).rotate([90, 0, 0]).translate([36, 0, 50]);
    const o = occ(cup().add(handle));
    expect(o.fraction([63.5, 0, 50], [1, 0, 0])).toBeLessThan(0.15); // volta externa da alça
    expect(o.fraction([52.5, 0, 50], [-1, 0, 0])).toBeGreaterThan(0.5); // dentro do vão, de frente para o corpo: fica liso
  });
});
