import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../geometry/manifold";
import { toMesh } from "../geometry/mesh";
import type { Model } from "../geometry/types";
import { checkModels } from "./checks";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const model = (...solids: Solid[]): Model => ({ name: "Peça", parts: solids.map((s, i) => ({ name: `P${i}`, color: "#000000", mesh: toMesh(s) })) });
const kinds = (m: Model) => checkModels(M, [m]).map((p) => `${p.kind}:${p.msg}`).join("\n");

test("peça boa: nenhuma queixa", () => {
  expect(checkModels(M, [model(M.Manifold.cube([20, 20, 3]), M.Manifold.cube([10, 10, 2]).translate([5, 5, 3]))])).toEqual([]);
});

test("corpo solto no ar e peça fora da mesa", () => {
  expect(kinds(model(M.Manifold.cube([20, 20, 3]), M.Manifold.cube([5, 5, 2]).translate([0, 0, 6])))).toMatch(/fail:.*solto/);
  expect(kinds(model(M.Manifold.cube([20, 20, 3]).translate([0, 0, 2])))).toMatch(/não encosta na mesa/);
  expect(kinds(model(M.Manifold.cube([300, 20, 3])))).toMatch(/não cabe na mesa/);
});

test("parede de 0,3 mm vira aviso; 1 mm não", () => {
  expect(kinds(model(M.Manifold.cube([20, 0.3, 5])))).toMatch(/warn:.*parede/);
  expect(kinds(model(M.Manifold.cube([20, 1, 5])))).toBe("");
});

test("malha aberta: não-manifold", () => {
  const open: Model = { name: "Aberta", parts: [{ name: "T", color: "#000000", mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) } }] };
  expect(checkModels(M, [open]).map((p) => p.msg).join()).toMatch(/não-manifold/);
});

test("vários objetos arrumados além da mesa: aviso", () => {
  const tag = (y: number): Model => ({ name: `T${y}`, parts: [{ name: "T", color: "#000000", mesh: toMesh(M.Manifold.cube([60, 28, 2]).translate([0, y, 0])) }] });
  expect(checkModels(M, [tag(0), tag(290)]).map((p) => `${p.kind}:${p.msg}`).join()).toMatch(/warn:.*conjunto.*passa da mesa/);
});
