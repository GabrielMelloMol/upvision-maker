import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import type { Mesh } from "./types";
import { CORE_KINDS, DEFAULT_LIGHTEN, latticeBlock, lightenModel, lightenSolid, massGrams, type CoreKind, type LightenOpts } from "./lighten";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
/** Corpos de material (volume positivo): as cavidades fechadas do miolo contam como corpos de volume negativo. */
const bodies = (s: Solid) => s.decompose().filter((b) => b.volume() > 0.01);
const opts = (kind: CoreKind, patch: Partial<LightenOpts> = {}): LightenOpts => ({ ...DEFAULT_LIGHTEN, kind, ...patch });

describe("miolo leve (#236)", () => {
  test.each(CORE_KINDS.map(([k]) => k))("%s: cubo de 40 mm fica válido, de uma peça só e mais leve que o maciço", (kind) => {
    const body = M.Manifold.cube([40, 40, 40]);
    const { solid: out, stats } = lightenSolid(M, body, opts(kind));
    expect(out.status()).toBe("NoError");
    expect(bodies(out)).toHaveLength(1);
    expect(stats.volume).toBeCloseTo(out.volume(), 3);
    expect(stats.volume).toBeLessThan(stats.solidVolume * 0.75);
    expect(stats.volume).toBeGreaterThan(stats.solidVolume * 0.15);
    for (const s of Object.values(stats.sections)) {
      expect(s).toBeGreaterThan(0.05);
      expect(s).toBeLessThan(1);
    }
  });

  test("a casca externa continua maciça: uma lâmina a meia espessura da parede não tem vazio", () => {
    const wall = 1.6;
    const { solid: out } = lightenSolid(M, M.Manifold.cube([40, 40, 40]), opts("gyroid", { wall }));
    const probe = M.Manifold.cube([0.2, 30, 30]).translate([wall / 2 - 0.1, 5, 5]);
    expect(out.intersect(probe).volume()).toBeCloseTo(0.2 * 30 * 30, 1);
  });

  test("casca 0 (bloco de treliça): a estrutura vai até a borda e a caixa externa é a pedida", () => {
    const { model, stats } = latticeBlock(M, [30, 20, 25], opts("cubic", { wall: 0 }));
    const b = solid(model.parts[0].mesh).boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo(30, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(20, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(25, 1);
    expect(stats.volume).toBeLessThan(30 * 20 * 25 * 0.4);
  });

  test("bloco sem casca: todo corpo de material encosta na mesa (nada solto no ar)", () => {
    for (const kind of ["gyroid", "voronoi", "cubic"] as const) {
      const { model } = latticeBlock(M, [60, 40, 30], opts(kind, { wall: 0 }));
      const mat = bodies(solid(model.parts[0].mesh));
      expect(mat.length, kind).toBeGreaterThan(0);
      for (const b of mat) expect(b.boundingBox().min[2], kind).toBeLessThanOrEqual(0.1);
    }
  });

  test("bastão mais grosso → mais material", () => {
    const thin = lightenSolid(M, M.Manifold.cube([40, 40, 40]), opts("gyroid", { strut: 0.8 })).stats.volume;
    const thick = lightenSolid(M, M.Manifold.cube([40, 40, 40]), opts("gyroid", { strut: 2 })).stats.volume;
    expect(thick).toBeGreaterThan(thin * 1.3);
  });

  test("célula menor → mais estrutura por volume", () => {
    const big = lightenSolid(M, M.Manifold.cube([40, 40, 40]), opts("cubic", { cell: 14 })).stats.volume;
    const small = lightenSolid(M, M.Manifold.cube([40, 40, 40]), opts("cubic", { cell: 7 })).stats.volume;
    expect(small).toBeGreaterThan(big);
  });

  test("voronoi: mesma semente repete o resultado e outra semente muda", () => {
    const body = () => M.Manifold.cube([40, 40, 40]);
    const a = lightenSolid(M, body(), opts("voronoi", { seed: 3 })).stats.volume;
    const b = lightenSolid(M, body(), opts("voronoi", { seed: 3 })).stats.volume;
    const c = lightenSolid(M, body(), opts("voronoi", { seed: 4 })).stats.volume;
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  test("esfera (casca curva): válida e mais leve que a maciça", () => {
    const { solid: out, stats } = lightenSolid(M, M.Manifold.sphere(25, 48), opts("gyroid"));
    expect(out.status()).toBe("NoError");
    expect(stats.volume).toBeLessThan(stats.solidVolume * 0.8);
  });

  test("peça fina demais para a casca dá erro claro", () => {
    expect(() => lightenSolid(M, M.Manifold.cube([40, 40, 2]), opts("gyroid", { wall: 1.6 }))).toThrow(/fina demais/);
  });

  test("modelo com várias partes vira uma peça só e avisa", () => {
    const part = (x: number) => {
      const m = M.Manifold.cube([30, 30, 30]).translate([x, 0, 0]).getMesh();
      return { name: "p", color: "#ff0000", mesh: { positions: new Float32Array(m.vertProperties), indices: new Uint32Array(m.triVerts) } };
    };
    const out = lightenModel(M, { name: "dois", parts: [part(0), part(25)] }, opts("gyroid", { cell: 8 }));
    expect(out.model.parts).toHaveLength(1);
    expect(out.warnings.join(" ")).toContain("viram uma peça só");
  });

  test("corte ao meio: sobra cerca de metade da peça, só para a prévia", () => {
    const { model, section } = latticeBlock(M, [30, 30, 30], opts("cubic", { cell: 10 }));
    const whole = solid(model.parts[0].mesh).volume();
    const half = solid(section).volume();
    expect(half).toBeGreaterThan(whole * 0.35);
    expect(half).toBeLessThan(whole * 0.65);
  });

  test("massa estimada em PLA: 1 cm³ ≈ 1,24 g", () => {
    expect(massGrams(1000)).toBeCloseTo(1.24, 2);
  });
});
