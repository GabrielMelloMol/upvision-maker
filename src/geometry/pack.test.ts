import { expect, test } from "vitest";
import { modelsBounds } from "./bounds";
import { packPlates } from "./pack";
import type { Mesh, Model } from "./types";

const box = (w: number, d: number, x = 0, y = 0): Mesh => ({
  positions: Float32Array.from([x, y, 0, x + w, y, 0, x, y + d, 0, x + w, y + d, 0, x, y, 5, x + w, y + d, 5]),
  indices: new Uint32Array([0, 1, 2]),
});
const m = (name: string, w: number, d: number, x = 0, y = 0): Model => ({ name, parts: [{ name, color: "#000", mesh: box(w, d, x, y) }] });
const overlap = (a: Model, b: Model) => {
  const A = modelsBounds([a])!, B = modelsBounds([b])!;
  return A.min[0] < B.max[0] && B.min[0] < A.max[0] && A.min[1] < B.max[1] && B.min[1] < A.max[1];
};

test("empacota em mesas de 256 mm sem sobrepor, com a margem da mesa, maiores primeiro", () => {
  const items = [m("a", 200, 100), m("b", 100, 100, 500, 500), m("c", 120, 120), m("d", 250, 250)];
  const plates = packPlates(items, 256, 5);
  expect(plates.flat()).toHaveLength(4);
  for (const plate of plates) {
    for (const x of plate) {
      const b = modelsBounds([x])!;
      expect(b.min[0]).toBeGreaterThanOrEqual(0);
      expect(b.min[1]).toBeGreaterThanOrEqual(0);
      expect(b.max[0]).toBeLessThanOrEqual(256 + 1e-6);
      expect(b.max[1]).toBeLessThanOrEqual(256 + 1e-6);
    }
    for (let i = 0; i < plate.length; i++) for (let j = i + 1; j < plate.length; j++) expect(overlap(plate[i], plate[j])).toBe(false);
  }
  expect(plates[0][0].name).toBe("d"); // a maior abre a primeira mesa
  expect(plates.length).toBeLessThanOrEqual(3);
});

test("peça maior que a mesa vai sozinha numa mesa (quem chama avisa)", () => {
  const plates = packPlates([m("grande", 300, 100), m("p", 10, 10)], 256, 5);
  expect(plates.map((p) => p.map((x) => x.name))).toEqual([["grande"], ["p"]]);
});
