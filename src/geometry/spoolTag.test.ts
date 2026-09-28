import { beforeAll, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { buildSpoolTag } from "./spoolTag";
import { volume } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([0.6 * h * s.length, h], true) : null);

test("plaquinha: placa clara, QR e texto escuros por cima, bolinha na cor do filamento, tudo dentro da placa", () => {
  const m = buildSpoolTag(M, text, { id: 7, title: "PLA Azul", color: "#2563eb" });
  expect(m.parts.map((p) => p.name)).toEqual(["Placa", "QR", "Texto", "PLA Azul"]);
  expect(m.parts[3].color).toBe("#2563eb");
  const plate = meshBounds([m.parts[0].mesh])!;
  for (const p of m.parts.slice(1)) {
    const b = meshBounds([p.mesh])!;
    expect(volume(p.mesh)).toBeGreaterThan(0);
    expect(b.min[2]).toBeCloseTo(1.6);
    expect(b.min[0]).toBeGreaterThanOrEqual(plate.min[0]);
    expect(b.max[0]).toBeLessThanOrEqual(plate.max[0]);
  }
});

test("sem cor reconhecida não tem bolinha", () => {
  expect(buildSpoolTag(M, text, { id: 1, title: "PETG", color: null }).parts.map((p) => p.name)).toEqual(["Placa", "QR", "Texto"]);
});
