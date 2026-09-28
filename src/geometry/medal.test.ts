import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { buildMedal, DEFAULT_MEDAL, medalOutline } from "./medal";
import { csFromContours, scoped } from "./shape2d";
import { modelSize, modelVolume, sq } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("medalha", () => {
  test("formatos têm o diâmetro pedido", () => {
    for (const shape of ["circle", "hexagon", "star", "shield"] as const) {
      const b = scoped((k) => k(medalOutline(M, shape, 50)).bounds());
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeCloseTo(50, 0);
    }
  });

  test("sem imagem nem texto: base + borda em relevo (2 partes); alça em cima com rasgo para a fita", () => {
    const m = scoped(() => buildMedal(M, DEFAULT_MEDAL, null, null));
    expect(m.parts.map((p) => p.name)).toEqual(["Base", "Destaque"]);
    const [w, h, z] = modelSize(m);
    expect(w).toBeCloseTo(DEFAULT_MEDAL.diameter, 0);
    expect(h).toBeGreaterThan(DEFAULT_MEDAL.diameter + 5); // alça
    expect(z).toBeCloseTo(DEFAULT_MEDAL.thickness + DEFAULT_MEDAL.relief);
    const noSlot = scoped(() => buildMedal(M, { ...DEFAULT_MEDAL, ribbon: 0 }, null, null));
    expect(modelSize(noSlot)[1]).toBeCloseTo(DEFAULT_MEDAL.diameter, 0);
  });

  test("imagem central vira parte própria e cabe dentro da borda", () => {
    const m = scoped((k) => buildMedal(M, DEFAULT_MEDAL, k(csFromContours(M, [sq(50)], "NonZero")), null));
    expect(m.parts.map((p) => p.name)).toEqual(["Base", "Destaque", "Imagem"]);
    const [iw] = modelSize({ ...m, parts: [m.parts[2]] });
    expect(iw).toBeLessThan(DEFAULT_MEDAL.diameter - 2 * DEFAULT_MEDAL.rim);
  });

  test("texto entra no volume de destaque", () => {
    const withText = scoped((k) => buildMedal(M, DEFAULT_MEDAL, null, k(csFromContours(M, [sq(20)], "NonZero"))));
    const without = scoped(() => buildMedal(M, DEFAULT_MEDAL, null, null));
    expect(modelVolume({ ...withText, parts: [withText.parts[1]] })).toBeGreaterThan(modelVolume({ ...without, parts: [without.parts[1]] }));
  });
});

test.each(["circle", "hexagon", "star", "shield"] as const)("base %s com alça é uma peça só (alça presa)", (shape) => {
  const m = scoped(() => buildMedal(M, { ...DEFAULT_MEDAL, shape }, null, null));
  const { positions, indices } = m.parts[0].mesh;
  const pieces = scoped((k) => k(new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: positions, triVerts: indices }))).decompose().map(k).length);
  expect(pieces).toBe(1);
});
