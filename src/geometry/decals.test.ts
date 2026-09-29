import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { applyDecals, decalFace, decalShape, placeDecal, type Decal } from "./decals";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { sq, volume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
/** Placa 60 × 40 × 3 com um furo de 6 mm no canto (argola) + texto em cima (outra parte). */
function plate(): Model {
  const face = new M.CrossSection([sq(30, 0, 0).map(([x, y]) => [x, (y * 40) / 60] as [number, number])], "NonZero").subtract(M.CrossSection.circle(3, 32).translate([24, 14]));
  return {
    name: "Placa",
    parts: [
      { name: "Base", color: "#2563eb", mesh: toMesh(face.extrude(3)) },
      { name: "Texto", color: "#ffffff", mesh: toMesh(M.CrossSection.square([10, 4], true).extrude(1).translate([0, -10, 3])) },
    ],
  };
}
const square = () => new M.CrossSection([sq(5)], "NonZero"); // 10 × 10
const base: Decal = { id: "a", x: 0, y: 5, width: 10, rotation: 0, mirror: false, mode: "raised", depth: 1, color: "#d6262e" };

describe("face e posicionamento", () => {
  test("face de cima da peça principal (a de maior topo): contorno com o furo, altura e nome", () => {
    const f = decalFace(M, [plate()]);
    expect(f.part).toBe("Base");
    expect(f.z).toBeCloseTo(3);
    expect(f.bounds.max[0] - f.bounds.min[0]).toBeCloseTo(60, 1);
    expect(f.outline.length).toBe(2); // contorno + furo
  });

  test("forma local: centrada na origem, na largura pedida", () => {
    const tri = new M.CrossSection([[[10, 10], [30, 10], [10, 20]]], "NonZero");
    const b = decalShape(tri, 50).bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(50, 3);
    expect(b.min[0] + b.max[0]).toBeCloseTo(0, 3);
    expect(b.min[1] + b.max[1]).toBeCloseTo(0, 3);
  });

  test("posiciona: largura em mm, rotação, espelho e deslocamento", () => {
    const tri = new M.CrossSection([[[0, 0], [20, 0], [0, 10]]], "NonZero");
    const p = placeDecal(tri, { ...base, width: 40, x: 7, y: -3 }, tri.bounds());
    const b = p.bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(40, 3);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(7, 3);
    const turned = placeDecal(tri, { ...base, width: 40, rotation: 90 }, tri.bounds()).bounds();
    expect(turned.max[1] - turned.min[1]).toBeCloseTo(40, 3);
    // espelho: o vértice do ângulo reto passa para o outro lado
    const m = placeDecal(tri, { ...base, width: 20, mirror: true }, tri.bounds());
    expect(m.toPolygons().flat().some(([x, y]) => x > 9 && y > 4)).toBe(true);
  });
});

describe("aplicar", () => {
  test("em relevo: parte nova na cor do desenho, saindo da face", () => {
    const { models, warnings } = applyDecals(M, [plate()], [{ decal: base, regions: [{ color: null, cs: square() }] }]);
    const d = models[0].parts.find((p) => p.name === "Desenho 1")!;
    expect(d.color).toBe("#d6262e");
    const b = meshBounds([d.mesh])!;
    expect([b.min[2], b.max[2]]).toEqual([expect.closeTo(3), expect.closeTo(4)]);
    expect(volume(d.mesh)).toBeCloseTo(100, 0);
    expect(warnings).toEqual([]);
  });

  test("gravado: afunda na base (volume a menos), sem parte nova", () => {
    const before = volume(plate().parts[0].mesh);
    const { models } = applyDecals(M, [plate()], [{ decal: { ...base, mode: "engraved", depth: 1 }, regions: [{ color: null, cs: square() }] }]);
    expect(models[0].parts).toHaveLength(2);
    expect(before - volume(models[0].parts[0].mesh)).toBeCloseTo(100, 0);
    expect(solid(models[0].parts[0].mesh).status()).toBe("NoError");
  });

  test("vazado: atravessa a base (vira furo)", () => {
    const { models } = applyDecals(M, [plate()], [{ decal: { ...base, mode: "cut" }, regions: [{ color: null, cs: square() }] }]);
    expect(solid(models[0].parts[0].mesh).genus()).toBe(2);
  });

  test("desenho colorido: uma parte por cor; decal escondido é ignorado", () => {
    const inner = new M.CrossSection([sq(2)], "NonZero");
    const regions = [
      { color: "#000000", cs: square().subtract(inner) },
      { color: "#ffff00", cs: inner },
    ];
    const { models } = applyDecals(M, [plate()], [
      { decal: base, regions },
      { decal: { ...base, id: "b", visible: false }, regions: [{ color: null, cs: square() }] },
    ]);
    expect(models[0].parts.filter((p) => p.name.startsWith("Desenho")).map((p) => p.color)).toEqual(["#000000", "#ffff00"]);
  });

  test("avisos: fora da peça, traço fino e encostando no furo da argola", () => {
    const out = applyDecals(M, [plate()], [{ decal: { ...base, x: 30 }, regions: [{ color: null, cs: square() }] }]);
    expect(out.warnings).toEqual([expect.objectContaining({ decalId: "a", text: expect.stringMatching(/sai da peça/) })]);
    const thin = new M.CrossSection([[[-5, -0.1], [5, -0.1], [5, 0.1], [-5, 0.1]]], "NonZero");
    expect(applyDecals(M, [plate()], [{ decal: { ...base, width: 10 }, regions: [{ color: null, cs: thin }] }]).warnings.map((w) => w.text).join()).toMatch(/fino/);
    const hole = applyDecals(M, [plate()], [{ decal: { ...base, x: 24, y: 10, width: 6 }, regions: [{ color: null, cs: square() }] }]);
    expect(hole.warnings.map((w) => w.text).join()).toMatch(/furo/);
  });
});
