import { beforeAll, expect, test } from "vitest";
import { extrudeDesign } from "./extrude";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { csFromContours, scoped } from "./shape2d";
import { modelSize, modelVolume, sq } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// quadrado 20 mm com furo de 10 mm
const design = () => csFromContours(M, [sq(10), sq(5)], "EvenOdd");

test("sem base: 1 parte com a altura pedida, furo preservado", () => {
  const m = scoped((k) => extrudeDesign(M, k(design()), { height: 3, base: null }));
  expect(m.parts).toHaveLength(1);
  expect(modelSize(m)[2]).toBeCloseTo(3);
  expect(modelVolume(m)).toBeCloseTo(300 * 3, 0);
});

test("com base: placa (silhueta + margem, sem furos) e desenho em cima, em cores separadas", () => {
  const m = scoped((k) => extrudeDesign(M, k(design()), { height: 1, base: { margin: 0, thickness: 2 } }));
  expect(m.parts.map((p) => p.name)).toEqual(["Base", "Desenho"]);
  expect(m.parts[0].color).not.toBe(m.parts[1].color);
  expect(modelSize(m)[2]).toBeCloseTo(3);
  expect(modelVolume(m)).toBeCloseTo(400 * 2 + 300 * 1, 0);
});

test("margem da base cresce para fora", () => {
  const m = scoped((k) => extrudeDesign(M, k(design()), { height: 1, base: { margin: 3, thickness: 2 } }));
  expect(modelSize(m)[0]).toBeCloseTo(26);
});
