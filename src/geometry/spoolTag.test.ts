import { beforeAll, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { layoutOnPlate } from "./keychain";
import { modelsBounds } from "./bounds";
import { buildSpoolTag, spoolTagsThatFit } from "./spoolTag";
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

test("quantas plaquinhas cabem: 21 arrumadas ficam dentro da mesa de 256 mm; 30 não cabiam (#124)", () => {
  const n = spoolTagsThatFit(248, 4);
  expect(n).toBe(21);
  const tag = buildSpoolTag(M, text, { id: 1, title: "PLA", color: "#2563eb" });
  const size = (k: number) => {
    const b = modelsBounds(layoutOnPlate(Array.from({ length: k }, () => tag), 248, 4))!;
    return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
  };
  expect(size(n)).toBeLessThanOrEqual(256);
  expect(size(30)).toBeGreaterThan(256);
});
