import { beforeAll, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { splitModelToBed, splitToBed } from "./splitBed";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

test("o corte da mesa não deixa lasca mais fina que um filete (#133)", () => {
  // placa de 300 mm (corta no meio, x = 150) e uma "letra" que passa só 0,3 mm do corte
  const plate = M.Manifold.cube([300, 50, 2]);
  const letter = M.Manifold.cube([20, 10, 1]).translate([130.3, 20, 2]);
  const models = splitModelToBed(M, "Painel", [
    { name: "Placa", color: "#fff", solid: plate },
    { name: "Nomes", color: "#000", solid: letter },
  ], 256);
  expect(models).toHaveLength(2);
  // a lasca de 0,3 mm na 2ª metade some; a letra inteira fica na 1ª
  expect(models[1].parts.map((p) => p.name)).toEqual(["Placa"]);
  expect(meshBounds([models[0].parts[1].mesh])!.max[0]).toBeCloseTo(150, 3);
  // splitToBed: a letra solta cortada também perde a lasca (a 2ª metade fica vazia e sai)
  const wide = letter.add(M.Manifold.cube([1, 1, 1]).translate([400, 20, 2]));
  const solids = splitToBed(M, wide, 256);
  expect(solids.every((s) => Math.min(...[0, 1].map((i) => s.boundingBox().max[i] - s.boundingBox().min[i])) >= 0.6)).toBe(true);
  for (const s of [plate, letter, wide, ...solids]) s.delete();
});
