import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import { buildSpoolHolder, DEFAULT_SPOOL_HOLDER, type SpoolHolderParams } from "./spoolHolder";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const holder = (p: Partial<SpoolHolderParams> = {}) => buildSpoolHolder({ M, art: null, text: () => null }, { ...DEFAULT_SPOOL_HOLDER, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const mesh = (o: ReturnType<typeof holder>, n: string) => o.models.find((m) => m.name === n)!.parts[0].mesh;
const P = DEFAULT_SPOOL_HOLDER;

describe("suporte de carretel (#234)", { timeout: 60_000 }, () => {
  test("o eixo é o furo do carretel menos a folga e passa pelo furo dos postes (folga do encaixe)", () => {
    const out = holder();
    const axle = meshBounds([mesh(out, "Eixo")])!;
    const head = P.hole - 2 * P.clearance + 16; // a cabeça é o maior diâmetro
    expect(axle.max[0] - axle.min[0]).toBeCloseTo(head, 1);
    const base = solid(mesh(out, "Base"));
    const axleZ = 5 + 4 + P.spoolD / 2;
    // um cilindro do tamanho do eixo atravessa os dois postes sem tocar neles
    const rod = M.Manifold.cylinder(300, (P.hole - 2 * P.clearance) / 2, (P.hole - 2 * P.clearance) / 2, 64).rotate([0, 90, 0]).translate([-150, 0, axleZ]);
    expect(base.intersect(rod).volume()).toBeLessThan(0.01);
    // e o carretel (cilindro do tamanho do furo) não toca o eixo, mas o poste prende o que passa do furo do encaixe
    const bigger = M.Manifold.cylinder(300, P.hole / 2 + 1, P.hole / 2 + 1, 64).rotate([0, 90, 0]).translate([-150, 0, axleZ]);
    expect(base.intersect(bigger).volume()).toBeGreaterThan(10);
    [base, rod, bigger].forEach((o) => o.delete());
  });

  test("o carretel de fora gira sem encostar na base e cabe entre os postes", () => {
    const base = solid(mesh(holder(), "Base"));
    const axleZ = 5 + 4 + P.spoolD / 2;
    const spool = M.Manifold.cylinder(P.spoolW, P.spoolD / 2, P.spoolD / 2, 128).rotate([0, 90, 0]).translate([-P.spoolW / 2, 0, axleZ]);
    expect(base.intersect(spool).volume()).toBeLessThan(0.01);
    [base, spool].forEach((o) => o.delete());
  });

  test("a base é uma peça só, o eixo assenta na mesa e avisa de folga pequena e base grande", () => {
    const out = holder();
    const b = solid(mesh(out, "Base"));
    expect(b.decompose().length).toBe(1);
    b.delete();
    expect(meshBounds([mesh(out, "Eixo")])!.min[2]).toBeCloseTo(0, 3);
    expect(holder({ clearance: 0.2 }).warnings?.join(" ")).toMatch(/Folga pequena/);
    expect(holder({ spoolD: 520 }).warnings?.join(" ")).toMatch(/passa da mesa|mais altos/);
    expect(out.warnings).toEqual([]);
  });
});
