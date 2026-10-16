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
    expect(out.warnings!.filter((w) => !/^Eixo oco/.test(w))).toEqual([]);
  });

  /** Raios (a partir do centro da seção) dos contornos de uma fatia em `z`: [maior raio de fora, menor raio de fora, maior raio do furo, menor raio do furo]. */
  function ringRadii(m: Mesh, z: number) {
    const s = solid(m);
    const cs = s.slice(z);
    const b = cs.bounds();
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const area = (poly: number[][]) => poly.reduce((a, q, i) => a + (q[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * q[1]) / 2, 0);
    const rs = (poly: number[][]) => poly.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
    const polys = cs.toPolygons();
    const outer = polys.filter((q) => area(q) > 0).flatMap(rs), holes = polys.filter((q) => area(q) < 0).flatMap(rs);
    [s, cs].forEach((o) => o.delete());
    return { outerMax: Math.max(...outer), outerMin: Math.min(...outer), holeMax: holes.length ? Math.max(...holes) : 0, holeMin: holes.length ? Math.min(...holes) : 0 };
  }

  test("eixo oco: o tubo tem a parede pedida, pesa uma fração do maciço e o peso aparece escrito", () => {
    const out = holder();
    const R = (P.hole - 2 * P.clearance) / 2;
    const r = ringRadii(mesh(out, "Eixo"), 40);
    expect(r.outerMax).toBeCloseTo(R, 1);
    expect(r.holeMax).toBeCloseTo(R - P.axleWall, 1);
    const axle = solid(mesh(out, "Eixo"));
    expect(axle.volume()).toBeLessThan(Math.PI * R * R * 102 * 0.45);
    axle.delete();
    expect(out.warnings!.join(" ")).toMatch(/Eixo oco inteiro: ≈ \d+ g de PLA \(parede de 3,5 mm; um eixo maciço seria ≈ \d+ g\)/);
    const wall6 = solid(mesh(holder({ axleWall: 6 }), "Eixo"));
    const wall35 = solid(mesh(out, "Eixo"));
    expect(wall6.volume()).toBeGreaterThan(wall35.volume());
    [wall6, wall35].forEach((o) => o.delete());
  });

  test("eixo em 2 partes rosqueadas: duas peças que cabem na metade da altura e a rosca do pino entra na luva com folga", () => {
    const two = holder({ axleParts: "two" });
    expect(two.models.map((m) => m.name)).toEqual(["Base", "Eixo (parte 1)", "Eixo (parte 2)"]);
    expect(meshBounds([mesh(two, "Eixo (parte 1)")])!.max[2]).toBeLessThan(80);
    expect(meshBounds([mesh(two, "Eixo (parte 2)")])!.max[2]).toBeLessThan(80);
    expect(two.warnings!.join(" ")).toMatch(/em 2 partes que rosqueiam/);
    const female = ringRadii(mesh(two, "Eixo (parte 1)"), 4 + 59 - 8); // meio da luva roscada
    const male = ringRadii(mesh(two, "Eixo (parte 2)"), 8); // meio do pino roscado
    expect(female.holeMax - male.outerMax).toBeGreaterThan(0.25); // folga na raiz dos dentes
    expect(female.holeMin - male.outerMin).toBeGreaterThan(0.25); // e na ponta
    // o pino é menor que o furo do tubo: entra
    expect(male.outerMax).toBeLessThan((P.hole - 2 * P.clearance) / 2 - P.axleWall);
    // cada parte é uma peça só (o pino está preso ao tubo, nada solto no ar)
    for (const n of ["Eixo (parte 1)", "Eixo (parte 2)"]) {
      const sd = solid(mesh(two, n));
      expect(sd.decompose().length, n).toBe(1);
      sd.delete();
    }
  });

  test("eixo que não cabe em pé avisa e oferece as 2 partes", () => {
    expect(holder({ spoolW: 300, thickness: 14 }).warnings!.join(" ")).toMatch(/escolha o eixo em 2 partes rosqueadas/);
  });
});
