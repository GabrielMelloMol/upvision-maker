// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, test, vi } from "vitest";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { toMesh } from "../../geometry/mesh";
import type { Model } from "../../geometry/types";
import { applyLayers } from "./applyLayers";
import { newArtLayer, newTextLayer } from "./layers";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../../..", `.${u}`));
    return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const plate = (): Model => ({ name: "Placa", parts: [{ name: "Base", color: "#2563eb", mesh: toMesh(M.CrossSection.square([80, 40], true).extrude(3)) }] });
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

test("sem camadas: devolve a face de cima para o gizmo e não mexe no modelo (#26)", async () => {
  const models = [plate()];
  const r = await applyLayers(M, models, []);
  expect(r.models).toBe(models);
  expect(r.face?.part).toBe("Base");
  expect(r.face!.bounds.max[0] - r.face!.bounds.min[0]).toBeCloseTo(80, 1);
});

test("desenho em relevo vira parte nova; texto gravado afunda; forma local para o gizmo na largura pedida", async () => {
  const face = { min: [-40, -20] as [number, number], max: [40, 20] as [number, number] };
  const art = { ...newArtLayer(SQUARE, "quadrado.svg", face), width: 10, color: "#ff0000" };
  const text = { ...newTextLayer(face), mode: "engraved" as const, y: -10, width: 30 };
  const r = await applyLayers(M, [plate()], [art, text]);
  expect(r.models[0].parts.map((p) => p.name)).toEqual(["Base", "Desenho 1"]);
  expect(r.models[0].parts[1].color).toBe("#ff0000");
  expect(r.shapes[art.id].width).toBe(10);
  expect(r.shapes[art.id].height).toBeCloseTo(10, 1);
  expect(r.shapes[text.id].polys.length).toBeGreaterThan(2);
  expect(r.warnings).toEqual([]);
});

test("aviso sai com o nome da camada e fica marcado na camada", async () => {
  const face = { min: [-40, -20] as [number, number], max: [40, 20] as [number, number] };
  const art = { ...newArtLayer(SQUARE, "Logo", face), x: 38, width: 20 };
  const r = await applyLayers(M, [plate()], [art]);
  expect(r.warnings[0]).toMatch(/^Logo: O desenho sai da peça/);
  expect(r.byLayer[art.id]).toHaveLength(1);
});
