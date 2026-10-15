import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildOrganizerBox } from "./organizerBox";
import { DEFAULT_ORGANIZER, type OrganizerParams } from "./organizer/params";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<OrganizerParams> = {}) => buildOrganizerBox(ctx(), { ...DEFAULT_ORGANIZER, ...p });

describe("caixa organizadora: geometria (#204)", { timeout: 120_000 }, () => {
  for (const lid of ["hinge", "snap", "slide", "none"] as const)
    test(`${lid}: gera, todas as malhas fecham e as vistas existem`, () => {
      const out = build({ lid });
      expect(out.models.length).toBeGreaterThan(0);
      for (const m of out.models) for (const q of m.parts) {
        const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: q.mesh.positions, triVerts: q.mesh.indices }));
        expect(s.status(), `${lid}/${m.name}/${q.name}`).toBe("NoError");
        s.delete();
      }
      expect(out.views!.map((v) => v.id)).toEqual(lid === "none" ? ["compartments", "pieces"] : ["compartments", "open", "closed", "pieces"]);
      const b = meshBounds(out.models.find((m) => m.name === "Caixa")!.parts.map((x) => x.mesh))!;
      expect(b.max[0] - b.min[0]).toBeGreaterThan(179);
    });
});

import { MissingInput } from "./common";
import { turnMesh } from "./organizerBox";
import { HINGE } from "./organizer/hinge";
import { dimsOf, LATCH_BY_MATERIAL, deriveOrganizer } from "./organizer/params";
import type { Mesh, Part } from "../types";

const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const partsOf = (out: ReturnType<typeof build>, view: string, ...names: string[]): Part[] => out.views!.find((v) => v.id === view)!.models[0].parts.filter((q) => names.includes(q.name));
const union = (parts: Part[]) => M.Manifold.union(parts.map((q) => solid(q.mesh)));
/** Volume que `a` invade em `b` (mm³). */
function overlap(a: Part[], b: Part[], move: (m: Mesh) => Mesh = (m) => m): number {
  const sa = M.Manifold.union(a.map((q) => solid(move(q.mesh)))), sb = union(b);
  const hit = sa.intersect(sb);
  const v = hit.volume();
  for (const s of [sa, sb, hit]) s.delete();
  return v;
}
const lift = (dz: number) => (m: Mesh): Mesh => ({ positions: m.positions.map((v, i) => (i % 3 === 2 ? v + dz : v)), indices: m.indices });

describe("caixa organizadora: dobradiça, trava e encaixes (#204)", { timeout: 180_000 }, () => {
  test("medidas: por fora a caixa tem 180 × 120 e 40 de altura fechada; por dentro vale o vão", () => {
    const d = dimsOf(DEFAULT_ORGANIZER);
    expect([d.outerW, d.outerD, d.totalH, d.innerW]).toEqual([180, 120, 40, 175.2]);
    const inner = dimsOf({ ...DEFAULT_ORGANIZER, measure: "inner", outerW: 100, outerD: 60, outerH: 30 });
    expect([inner.innerW, inner.outerW, inner.depth]).toEqual([100, 104.8, 30]);
    const b = meshBounds(partsOf(build({ lid: "slide" }), "closed", "Caixa", "Tampa").map((q) => q.mesh))!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(40, 1);
  });

  test("dobradiça fechada: a tampa não invade a caixa nem os pinos, e os pinos não prendem nas orelhas (folga radial 0,3)", () => {
    const out = build({ lid: "hinge" });
    const box = partsOf(out, "closed", "Caixa"), lid = partsOf(out, "closed", "Tampa", "Dobradiça"), pins = partsOf(out, "closed", "Pino");
    expect(pins).toHaveLength(2);
    expect(overlap(lid, box)).toBeLessThan(0.01);
    expect(overlap(pins, box)).toBeLessThan(0.001);
    expect(overlap(pins, lid)).toBeLessThan(0.001);
  });

  test("a tampa gira até o batente (~100°) sem bater e bate logo depois", () => {
    const out = build({ lid: "hinge" });
    const box = partsOf(out, "closed", "Caixa"), lid = partsOf(out, "closed", "Tampa", "Dobradiça");
    const A = hingeAxis();
    const turned = (deg: number) => (m: Mesh) => turnMesh(m, A.y, A.z, deg);
    for (const deg of [10, 45, 90, HINGE.stopDeg - 4]) expect(overlap(lid, box, turned(deg)), `${deg}°`).toBeLessThan(0.01);
    expect(overlap(lid, box, turned(HINGE.stopDeg + 6))).toBeGreaterThan(0.5);
    // o ângulo exato do contato: entre 97° e 103° (aleta calculada para os 100°)
    let first = 0;
    for (let deg = 90; deg <= 115 && !first; deg += 0.5) if (overlap(lid, box, turned(deg)) > 0.01) first = deg;
    expect(first).toBeGreaterThan(97);
    expect(first).toBeLessThan(103);
  });

  test("trava: o dente fica a `latchClearance` da tampa; erguer a tampa mais que isso bate nele", () => {
    const c = 0.4;
    const out = build({ lid: "hinge", latchClearance: c });
    const box = partsOf(out, "closed", "Caixa"), lid = partsOf(out, "closed", "Tampa", "Dobradiça");
    expect(overlap(lid, box, lift(c - 0.05))).toBeLessThan(0.01);
    expect(overlap(lid, box, lift(c + 0.15))).toBeGreaterThan(0.05);
  });

  test("material muda a folga da trava (PLA 0,35 … Nylon 0,5)", () => {
    expect(deriveOrganizer("material", "pla")).toEqual({ latchClearance: LATCH_BY_MATERIAL.pla });
    expect(deriveOrganizer("material", "nylon")).toEqual({ latchClearance: 0.5 });
    expect(deriveOrganizer("wall", 2)).toBeUndefined();
    // Faixa por faixa parte das faixas que estavam na tela
    expect(deriveOrganizer("layoutMode", "custom", {}, { ...DEFAULT_ORGANIZER, layoutMode: "channel", cols: 4, rows: 3 })).toEqual({ strips: "1:1.5, 4:1, 4:1" });
    expect(deriveOrganizer("layoutMode", "equal", {}, { ...DEFAULT_ORGANIZER })).toBeUndefined();
  });

  for (const lid of ["snap", "slide"] as const)
    test(`${lid}: fechada a tampa não invade a caixa, com as divisórias em faixas`, () => {
      const out = build({ lid, layoutMode: "mixed" });
      expect(overlap(partsOf(out, "closed", "Tampa"), partsOf(out, "closed", "Caixa"))).toBeLessThan(0.01);
    });

  test("nichos pequenos demais viram aviso de estado vazio (MissingInput), não erro", () => {
    expect(() => build({ outerW: 60, outerD: 50, cols: 10, rows: 8, layoutMode: "equal" })).toThrow(MissingInput);
  });

  test("mais nichos = mais parede: o volume da caixa cresce com as divisões", () => {
    const v = (p: Partial<OrganizerParams>) => volume(build({ lid: "none", ...p }).models[0].parts[0].mesh);
    expect(v({ cols: 6, rows: 5 })).toBeGreaterThan(v({ cols: 2, rows: 2 }));
  });

  test("nome na lateral: embutido sai como parte colorida na Caixa; gravado só fura; relevo cresce a caixa", () => {
    const inlay = build({ lid: "slide", labelPlace: "sideLong", textMode: "inlay" });
    expect(inlay.models.find((m) => m.name === "Caixa")!.parts.map((q) => q.name)).toContain("Nome");
    const eng = build({ lid: "slide", labelPlace: "sideLong", textMode: "engraved" });
    expect(eng.models.find((m) => m.name === "Caixa")!.parts.map((q) => q.name)).not.toContain("Nome");
    const raised = build({ lid: "none", labelPlace: "sideLong", textMode: "raised" });
    const plain = build({ lid: "none", labelPlace: "none" });
    const y = (o: ReturnType<typeof build>) => meshBounds(o.models.flatMap((m) => m.parts.map((q) => q.mesh)))!.min[1];
    expect(y(raised)).toBeLessThan(y(plain) - 0.4);
  });

  test("puxador e porta-etiqueta: o puxador é uma peça solta; o porta-etiqueta só afunda a frente", () => {
    expect(build({ lid: "hinge", handle: true }).models.map((m) => m.name)).toEqual(["Tampa", "Caixa", "Pino 1", "Pino 2", "Puxador"]);
    const v = (p: Partial<OrganizerParams>) => volume(build({ lid: "none", ...p }).models[0].parts[0].mesh);
    expect(v({ labelSlot: true, labelPlace: "none" })).toBeLessThan(v({ labelSlot: false, labelPlace: "none" }));
  });

  test("empilhável: a tampa ganha o anel e a caixa o rebaixo no fundo, que se encaixam", () => {
    const base = build({ lid: "hinge", stackable: false }), st = build({ lid: "hinge", stackable: true });
    const vol = (o: ReturnType<typeof build>, name: string) => volume(o.models.find((m) => m.name === name)!.parts[0].mesh);
    expect(vol(st, "Tampa")).toBeGreaterThan(vol(base, "Tampa"));
    expect(vol(st, "Caixa")).toBeLessThan(vol(base, "Caixa"));
  });
});

function hingeAxis() {
  const d = dimsOf(DEFAULT_ORGANIZER);
  return { y: d.outerD / 2 + HINGE.off, z: d.bodyH + HINGE.rk };
}

describe("tampa de dobradiça: a peça principal da Vista de cima é a placa", { timeout: 120_000 }, () => {
  test("a face escolhida para o desenho e o texto livre é a Tampa (não o Texto nem os nós)", async () => {
    const { decalFace } = await import("../decals");
    const out = build({ lid: "hinge" });
    expect(decalFace(M, out.models).part).toBe("Tampa");
    const lidB = meshBounds(out.models[0].parts.filter((q) => q.name === "Tampa").map((q) => q.mesh))!;
    expect(lidB.max[0] - lidB.min[0]).toBeGreaterThan(170);
  });
});
