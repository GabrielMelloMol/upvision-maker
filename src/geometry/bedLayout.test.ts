import { beforeAll, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "./bounds";
import { fitSetOnBed, MAX_PLATES, platesLimitWarning, platesNeeded, splitIntoLots } from "./bedLayout";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const box = (name: string, w: number, d: number, x = 0, y = 0): Model => ({ name, parts: [{ name, color: "#000000", mesh: toMesh(M.Manifold.cube([w, d, 5]).translate([x, y, 0])) }] });
const extent = (ms: Model[]) => {
  const b = modelsBounds(ms)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1]];
};

test("conjunto que passa da mesa, com peças que cabem: rearruma dentro de 256 mm e a 1ª peça não sai do lugar (#125)", () => {
  // placa de 150 e base de 180 lado a lado passam de 256; uma embaixo da outra cabem
  const set = [box("Placa", 150, 100), box("Base", 180, 120, 170, 0)];
  const out = fitSetOnBed(set);
  expect(Math.max(...extent(out))).toBeLessThanOrEqual(256);
  expect(meshBounds(out[0].parts.map((p) => p.mesh))!.min).toEqual(meshBounds(set[0].parts.map((p) => p.mesh))!.min);
});

test("não cabe de jeito nenhum: não mexe e diz que vai em mais de uma mesa", async () => {
  const { setOnBedWarning } = await import("./bedLayout");
  const set = [box("Placa", 150, 170), box("Base", 180, 120, 170, 0)];
  expect(fitSetOnBed(set)).toBe(set);
  expect(setOnBedWarning(set)).toMatch(/não cabem juntas/);
  expect(setOnBedWarning([box("A", 50, 50)])).toBeNull();
});

test("já cabe ou peça sozinha maior que a mesa: não mexe", () => {
  const ok = [box("A", 50, 50), box("B", 50, 50, 60, 0)];
  expect(fitSetOnBed(ok)).toBe(ok);
  const big = [box("Enorme", 300, 50), box("B", 50, 50, 310, 0)];
  expect(fitSetOnBed(big)).toBe(big);
});

test("mesas necessárias: soma das caixas sobre a área útil; passando do limite do fatiador avisa", () => {
  const few = Array.from({ length: 3 }, (_, i) => box(`P${i}`, 120, 120));
  expect(platesNeeded(few)).toBe(1);
  expect(platesLimitWarning(few)).toBeNull();
  const many = Array.from({ length: 60 }, (_, i) => box(`P${i}`, 230, 245));
  expect(platesNeeded(many)).toBeGreaterThan(MAX_PLATES);
  expect(platesLimitWarning(many)).toMatch(/60 peças.*mais que as 36/);
});

test("lotes: cada um com até 36 mesas, na ordem, sem perder nem repetir peça", () => {
  const many = Array.from({ length: 100 }, (_, i) => box(`P${i}`, 230, 245));
  const lots = splitIntoLots(many);
  expect(lots.length).toBeGreaterThan(1);
  for (const lot of lots) expect(platesNeeded(lot)).toBeLessThanOrEqual(MAX_PLATES);
  expect(lots.flat().map((m) => m.name)).toEqual(many.map((m) => m.name));
  // o penúltimo lote já está cheio: não cabe nem mais uma peça sem passar do limite
  expect(platesNeeded([...lots[0], many[lots[0].length]])).toBeGreaterThan(MAX_PLATES);
  // pouca coisa: um lote só; vazio: nenhum
  expect(splitIntoLots(many.slice(0, 3))).toHaveLength(1);
  expect(splitIntoLots([])).toEqual([]);
  // uma peça que sozinha passa do limite fica num lote só dela
  const huge = box("grande", 256, 256);
  expect(splitIntoLots([huge, huge, huge], 4).map((l) => l.length)).toEqual([2, 1]);
  expect(splitIntoLots([huge], 0).map((l) => l.length)).toEqual([1]);
});
