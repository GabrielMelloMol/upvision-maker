// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { meshBounds } from "./bounds";
import { toMesh } from "./mesh";
import { volume } from "./testUtil";
import type { Decal, DecalRegions } from "./decals";
import { applySurfaceDecals, surfaceIndex } from "./surfaceDecal";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const R = 30;
/** Esfera de raio 30 com o polo +Z na origem do quadro local: o ponto escolhido fica no topo (z = 0 no ponto). */
const sphere = (): Model => ({ name: "Esfera", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.sphere(R, 96).translate([0, 0, -R])) }] });
const square = (s: number): DecalRegions => [{ color: null, cs: M.CrossSection.square([s, s], true) }];
const decal = (patch: Partial<Decal> = {}): Decal => ({ id: "d1", x: 0, y: 0, width: 10, rotation: 0, mirror: false, mode: "raised", depth: 0.8, color: "#d6262e", ...patch });

describe("decal em superfície curva (#212)", { timeout: 120_000 }, () => {
  test("a grade acha o topo e a normal da esfera", () => {
    const idx = surfaceIndex(sphere().parts[0].mesh);
    const top = idx.sample(0, 0)!;
    expect(top.z).toBeCloseTo(0, 1);
    expect(top.nz).toBeCloseTo(1, 2);
    const side = idx.sample(15, 0)!; // a 15 mm do eixo: z = sqrt(R² − 15²) − R, normal inclinada 30°
    expect(side.z).toBeCloseTo(Math.sqrt(R * R - 15 * 15) - R, 1);
    expect(side.nx).toBeCloseTo(0.5, 1);
    expect(idx.sample(40, 0)).toBeNull();
  });

  test("relevo: parte nova que acompanha a curva, sem entrar na peça e com a altura pedida", () => {
    const m = sphere();
    const out = applySurfaceDecals(M, [m], [{ decal: decal(), regions: square(10) }]);
    expect(out.warnings).toEqual([]);
    const [body, relief] = out.models[0].parts;
    expect(relief.color).toBe("#d6262e");
    // o centro do relevo está 0,8 mm acima da superfície; o canto (a 7 mm do eixo) acompanha a curva
    const rb = meshBounds([relief.mesh])!;
    expect(rb.max[2]).toBeCloseTo(0.8, 1);
    const cornerSurface = Math.sqrt(R * R - 2 * 5 * 5) - R;
    expect(rb.min[2]).toBeLessThan(cornerSurface + 0.05); // desce acompanhando a curva
    // não há sobreposição: união = soma dos volumes
    const sum = volume(body.mesh) + volume(relief.mesh);
    const union = volume(toMesh(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: body.mesh.positions, triVerts: body.mesh.indices })).add(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: relief.mesh.positions, triVerts: relief.mesh.indices })))));
    expect(union).toBeCloseTo(sum, 0);
    expect(volume(relief.mesh)).toBeGreaterThan(10 * 10 * 0.8 * 0.95); // ≈ área × altura (a curva só aumenta um pouco)
    expect(volume(relief.mesh)).toBeLessThan(10 * 10 * 0.8 * 1.15);
  });

  test("gravado afunda a peça na curva; embutido devolve a cor no mesmo lugar (volume total igual)", () => {
    const v0 = volume(sphere().parts[0].mesh);
    const eng = applySurfaceDecals(M, [sphere()], [{ decal: decal({ mode: "engraved", depth: 0.6 }), regions: square(10) }]).models[0];
    expect(eng.parts).toHaveLength(1);
    expect(v0 - volume(eng.parts[0].mesh)).toBeGreaterThan(10 * 10 * 0.6 * 0.95);
    expect(v0 - volume(eng.parts[0].mesh)).toBeLessThan(10 * 10 * 0.6 * 1.15);
    const inl = applySurfaceDecals(M, [sphere()], [{ decal: decal({ mode: "inlay", depth: 0.6 }), regions: square(10) }]).models[0];
    expect(inl.parts).toHaveLength(2);
    expect(volume(inl.parts[0].mesh) + volume(inl.parts[1].mesh)).toBeCloseTo(v0, 0);
    expect(meshBounds(inl.parts.map((p) => p.mesh))!.max[2]).toBeCloseTo(0, 1); // rente à superfície
  });

  test("avisa quando o desenho sai da peça e quando pega trecho muito inclinado", () => {
    const small: Model = { name: "Disco", parts: [{ name: "Peça", color: "#ddd", mesh: toMesh(M.Manifold.cylinder(5, 8, 8, 64)) }] };
    const out = applySurfaceDecals(M, [small], [{ decal: decal({ width: 30 }), regions: square(10) }]);
    expect(out.warnings.map((w) => w.text).join(" ")).toMatch(/sai da peça/);
    const big = applySurfaceDecals(M, [sphere()], [{ decal: decal({ width: 40 }), regions: square(10) }]);
    expect(big.warnings.map((w) => w.text).join(" ")).toMatch(/inclinado/);
  });

  test("deslocar o desenho (x, y) cola no lugar certo da curva", () => {
    const out = applySurfaceDecals(M, [sphere()], [{ decal: decal({ x: 12, y: 0, width: 6 }), regions: square(10) }]);
    const rb = meshBounds([out.models[0].parts[1].mesh])!;
    expect((rb.min[0] + rb.max[0]) / 2).toBeCloseTo(12, 0);
    const surfaceAt12 = Math.sqrt(R * R - 144) - R;
    expect(rb.max[2]).toBeGreaterThan(surfaceAt12 + 0.7);
  });
});
