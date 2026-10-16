import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { capSolid, DEFAULT_CAP, DEFAULT_THREAD, halfPost, threadedRod, threadRadius } from "./thread";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("rosca", () => {
  test("o perfil vai da raiz à crista e repete a cada passo", () => {
    const t = DEFAULT_THREAD;
    const radii = Array.from({ length: 100 }, (_, i) => threadRadius((i / 100) * t.pitch, t));
    expect(Math.min(...radii)).toBeCloseTo(t.major - t.depth, 6);
    expect(Math.max(...radii)).toBeCloseTo(t.major, 6);
    expect(threadRadius(0.3, t)).toBeCloseTo(threadRadius(0.3 + 2 * t.pitch, t), 9);
  });

  test("o pino é um sólido fechado entre o raio da raiz e o da crista", () =>
    scoped((k) => {
      const rod = k(threadedRod(M, k, DEFAULT_THREAD));
      expect(rod.isEmpty()).toBe(false);
      const b = rod.boundingBox();
      expect(b.max[2] - b.min[2]).toBeCloseTo(DEFAULT_THREAD.length, 5);
      expect(b.max[0]).toBeLessThanOrEqual(DEFAULT_THREAD.major + 0.01);
      const vol = rod.volume();
      const minor = DEFAULT_THREAD.major - DEFAULT_THREAD.depth;
      expect(vol).toBeGreaterThan(Math.PI * minor ** 2 * DEFAULT_THREAD.length);
      expect(vol).toBeLessThan(Math.PI * DEFAULT_THREAD.major ** 2 * DEFAULT_THREAD.length);
    }));

  test("a metade do pino apoia no plano z = 0 e segue o eixo +Y", () =>
    scoped((k) => {
      const half = k(halfPost(M, k, DEFAULT_THREAD));
      const b = half.boundingBox();
      expect(b.min[2]).toBeCloseTo(0, 6);
      expect(b.max[2]).toBeCloseTo(DEFAULT_THREAD.major, 1);
      expect(b.min[1]).toBeCloseTo(0, 6);
      expect(b.max[1]).toBeCloseTo(DEFAULT_THREAD.length, 5);
      const rod = k(threadedRod(M, k, DEFAULT_THREAD));
      expect(half.volume()).toBeGreaterThan(rod.volume() * 0.45);
      expect(half.volume()).toBeLessThan(rod.volume() * 0.55);
    }));

  test("a tampa tem a rosca por dentro com a folga: o pino entra e não sobra metade do espaço", () =>
    scoped((k) => {
      const cap = k(capSolid(M, k, DEFAULT_CAP));
      const rod = k(k(threadedRod(M, k, DEFAULT_THREAD)).translate([0, 0, DEFAULT_CAP.floor]));
      // o pino fica dentro da cavidade da tampa sem encostar no material
      expect(cap.intersect(rod).volume()).toBeLessThan(0.5);
      const unionVol = cap.volume() + rod.volume();
      expect(k(M.Manifold.union([cap, rod])).volume()).toBeGreaterThan(unionVol - 0.5);
      // a folga é pequena: a cavidade tem pouco mais volume que o pino
      const bore = k(k(threadedRod(M, k, { ...DEFAULT_THREAD, length: DEFAULT_THREAD.length + 0.8 }, DEFAULT_CAP.clearance)).translate([0, 0, DEFAULT_CAP.floor]));
      expect(bore.volume() / rod.volume()).toBeLessThan(1.35);
    }));

  test("a tampa tem o furo da fita vazado de cima a baixo, na alça", () =>
    scoped((k) => {
      const cap = k(capSolid(M, k, DEFAULT_CAP));
      const outerR = DEFAULT_THREAD.major + DEFAULT_CAP.clearance + DEFAULT_CAP.wall;
      const loopW = DEFAULT_CAP.loopHole + 2 * DEFAULT_CAP.loopRim;
      const cy = outerR + loopW / 2;
      const probe = k(k(M.Manifold.cylinder(10, DEFAULT_CAP.loopHole / 2 - 0.1, DEFAULT_CAP.loopHole / 2 - 0.1, 24)).translate([0, cy, -2]));
      expect(cap.intersect(probe).volume()).toBeLessThan(1e-6);
      // em volta do furo há material (a alça)
      const ring = k(k(M.Manifold.cylinder(1, loopW / 2 - 0.2, loopW / 2 - 0.2, 24)).translate([0, cy, 0.2]));
      expect(cap.intersect(ring).volume()).toBeGreaterThan(5);
      expect(cap.boundingBox().max[1]).toBeCloseTo(cy + loopW / 2, 1);
    }));
});
