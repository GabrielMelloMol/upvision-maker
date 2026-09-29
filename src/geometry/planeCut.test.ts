import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { cutModels, DEFAULT_CUT, pinSpots } from "./planeCut";
import { volume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const cube = (): Model => ({ name: "Cubo", parts: [{ name: "Cubo", color: "#2563eb", mesh: toMesh(M.Manifold.cube([20, 20, 20])) }] });
const vol = (m: Model) => m.parts.reduce((s, p) => s + volume(p.mesh), 0);

describe("corte pelo plano com encaixe", () => {
  test("sem pino: duas metades com o volume do cubo, lado a lado e apoiadas na mesa", () => {
    const { models } = cutModels(M, [cube()], { ...DEFAULT_CUT, pin: "none" });
    expect(models.map((m) => m.name)).toEqual(["Cubo · parte A", "Cubo · parte B"]);
    expect(vol(models[0])).toBeCloseTo(4000, 0);
    expect(vol(models[1])).toBeCloseTo(4000, 0);
    const [a, b] = models.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    expect(a.min[2]).toBeCloseTo(0);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.min[0]).toBeGreaterThan(a.max[0]);
  });

  test("pino solto: furo nas duas partes (face cortada na mesa) e o pino cabe no furo com folga", () => {
    const { models } = cutModels(M, [cube()], { ...DEFAULT_CUT, pin: "round", size: 6, clearance: 0.2 });
    expect(models).toHaveLength(3);
    const [a, b, pins] = models;
    expect(vol(a)).toBeLessThan(4000 - 50);
    expect(vol(b)).toBeLessThan(4000 - 50);
    const pin = solid(pins.parts[0].mesh);
    const pb = pin.boundingBox();
    // o furo começa na mesa (face cortada para baixo): um pino de 6 mm encaixado no furo da parte B não bate
    const partB = solid(b.parts[0].mesh);
    const bb = partB.boundingBox();
    const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
    const probe = M.Manifold.cylinder((pb.max[2] - pb.min[2]) / 2, 3, 3, 48).translate([cx, cy, 0]);
    expect(partB.intersect(probe).volume()).toBeCloseTo(0, 2);
    // um pino 1 mm mais grosso bate: o furo tem só a folga
    expect(partB.intersect(M.Manifold.cylinder(2, 3.6, 3.6, 48).translate([cx, cy, 0])).volume()).toBeGreaterThan(1);
  });

  test("pino fixo: sai da parte A (em pé) e a parte B tem o furo", () => {
    const { models } = cutModels(M, [cube()], { ...DEFAULT_CUT, pin: "square", mode: "fixed", size: 6 });
    expect(models).toHaveLength(2);
    const a = meshBounds(models[0].parts.map((p) => p.mesh))!;
    expect(a.max[2]).toBeGreaterThan(10.5); // metade de 10 mm + o pino
    expect(vol(models[0])).toBeGreaterThan(4000);
  });

  test("corte em X: as partes deitam com a face cortada na mesa; volumes conservados", () => {
    const { models } = cutModels(M, [cube()], { ...DEFAULT_CUT, axis: "x", at: 0.25, pin: "none" });
    const v = models.map(vol);
    expect(v[0] + v[1]).toBeCloseTo(8000, 0);
    expect(Math.min(...v)).toBeCloseTo(2000, 0);
  });

  test("pinos: 1 por ilha, 2 se a ilha for comprida; ilha fina sem pino", () => {
    const two = M.CrossSection.union([M.CrossSection.square([20, 20], true), M.CrossSection.square([20, 20], true).translate([40, 0])]);
    expect(pinSpots(M, two, 5)).toHaveLength(2);
    expect(pinSpots(M, M.CrossSection.square([100, 20], true), 5)).toHaveLength(2);
    expect(pinSpots(M, M.CrossSection.square([4, 30], true), 5)).toHaveLength(0);
  });

  test("peça fina demais para o pino: aviso e sai sem encaixe", () => {
    const thin: Model = { name: "Placa", parts: [{ name: "Placa", color: "#000000", mesh: toMesh(M.Manifold.cube([40, 3, 20])) }] };
    const r = cutModels(M, [thin], { ...DEFAULT_CUT, size: 6 });
    expect(r.warnings.join()).toMatch(/fino demais/);
    expect(r.models).toHaveLength(2);
  });

  test("peça multicor: cada parte (cor) é cortada e continua com a sua cor", () => {
    const two: Model = {
      name: "Duas cores",
      parts: [
        { name: "Base", color: "#000000", mesh: toMesh(M.Manifold.cube([20, 20, 10])) },
        { name: "Topo", color: "#ffffff", mesh: toMesh(M.Manifold.cube([20, 20, 10]).translate([0, 0, 10])) },
      ],
    };
    const { models } = cutModels(M, [two], { ...DEFAULT_CUT, axis: "y", pin: "none" });
    expect(models[0].parts.map((p) => p.color)).toEqual(["#000000", "#ffffff"]);
    expect(models[1].parts.map((p) => p.color)).toEqual(["#000000", "#ffffff"]);
  });
});
