import { expect, test } from "vitest";
import { modelsBounds } from "../bounds";
import type { Model } from "../types";
import { layoutPlates } from "./layout";

const box = (name: string, w: number, d: number): Model => {
  const positions = Float32Array.from([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, 1, w, 0, 1, w, d, 1, 0, d, 1]);
  return { name, parts: [{ name, color: "#fff", mesh: { positions, indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]) } }] };
};

test("cada arquivo vai numa placa do tamanho da mesa, lado a lado, com o nome na legenda e nenhuma peça fora do contorno", () => {
  const out = layoutPlates([{ label: "PLA 0,20 mm", models: [box("a", 100, 80)] }, { label: "PETG 0,24 mm", models: [box("b", 200, 150)] }], 256);
  const names = out.flatMap((m) => m.parts.map((p) => p.name)).filter((n) => n.startsWith("Placa"));
  expect(names).toEqual(["Placa 1 · PLA 0,20 mm", "Placa 2 · PETG 0,24 mm"]);
  const pieces = out.filter((m) => m.parts.every((p) => !p.lines));
  const [a, b] = pieces.map((m) => modelsBounds([m])!);
  expect(a.min[0]).toBeGreaterThanOrEqual(-128);
  expect(a.max[0]).toBeLessThanOrEqual(128);
  expect(b.min[0]).toBeGreaterThanOrEqual(256 + 20 - 128);
  expect(b.max[0]).toBeLessThanOrEqual(256 + 20 + 128);
  expect(Math.min(a.min[1], b.min[1])).toBeGreaterThanOrEqual(-128);
  expect(Math.max(a.max[1], b.max[1])).toBeLessThanOrEqual(128);
});
