import { beforeAll, describe, expect, test } from "vitest";
import { bedMm } from "../bed";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { modelVolume, volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildBigFrame, DEFAULT_BIG_FRAME as D, frameDims, framePieces, FRAME_LAP, FRAME_LIP, TAIL_LEN, type BigFrameParams } from "./bigFrame";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: () => null });
const build = (p: Partial<BigFrameParams> = {}) => buildBigFrame(ctx(), { ...D, ...p });
const pieces = (p: Partial<BigFrameParams> = {}) => framePieces(ctx(), { ...D, ...p });
const overlap = (a: Solid, b: Solid) => {
  const i = a.intersect(b);
  const v = i.volume();
  i.delete();
  return v;
};

/** Volume do anel reto sem furos: casca − janela − rebaixo (o rebaixo entra até a frente de 3 mm). */
function ringVolume(p: BigFrameParams) {
  const d = frameDims(p);
  const rebate = (p.artW + 1) * (p.artH + 1) - d.winW * d.winH;
  return d.outW * d.outH * p.depth - d.winW * d.winH * p.depth - rebate * (p.depth - FRAME_LIP);
}

const PLAIN = { claws: false, back: "none" as const, profile: "flat" as const };

describe("moldura grande dividida", () => {
  test("a moldura pequena cabe na mesa e sai em uma peça só, com os cantos em outra cor", () => {
    const out = build({ ...PLAIN, artW: 150, artH: 200, width: 20 });
    expect(out.models).toHaveLength(1);
    expect(out.models[0].parts.map((x) => x.color)).toEqual([D.bodyColor, D.cornerColor]);
    const b = modelsBounds(out.models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(150 - 2 * FRAME_LAP + 40, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(200 - 2 * FRAME_LAP + 40, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(D.depth, 2);
  });

  test("o volume da moldura de uma peça confere com a conta do anel e do rebaixo", () => {
    const p = { ...D, ...PLAIN, artW: 150, artH: 200, width: 20 };
    const out = buildBigFrame(ctx(), p);
    expect(modelVolume(out.models[0])).toBeCloseTo(ringVolume(p), -1);
  });

  test("a janela e o rebaixo ficam na medida da arte, com a frente de 3 mm cobrindo 5 mm", () => {
    const p = { ...D, ...PLAIN, artW: 150, artH: 200, width: 20 };
    const probe = (x: number, y: number, z: number) => {
      const out = buildBigFrame(ctx(), p);
      const cubes = out.models[0].parts.map((part) => {
        const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices }));
        const c = M.Manifold.cube([0.2, 0.2, 0.2], true).translate([x, y, z]);
        const v = overlap(s, c);
        [s, c].forEach((o) => o.delete());
        return v;
      });
      return cubes.reduce((a, b) => a + b, 0) > 0.004;
    };
    const b = modelsBounds(buildBigFrame(ctx(), p).models)!;
    const [cx, cy] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    // meio da janela vazio, faixa da frente (5 mm) cheia só no alto, faixa de trás (além da arte) cheia em tudo
    expect(probe(cx, cy, 5)).toBe(false);
    const edge = cx + (150 - 2 * FRAME_LAP) / 2 + FRAME_LAP / 2;
    expect(probe(edge, cy, p.depth - FRAME_LIP / 2)).toBe(true);
    expect(probe(edge, cy, 2)).toBe(false);
    expect(probe(cx + 75 + 5, cy, 2)).toBe(true);
  });

  test("a moldura grande sai em peças que cabem na mesa e a conta de peças bate", () => {
    const p = { ...D, ...PLAIN };
    const d = frameDims(p);
    const out = build(PLAIN);
    expect(out.models).toHaveLength(4 + d.nTop + d.nBottom + 2 * d.nSide);
    for (const m of out.models) {
      const b = modelsBounds([m])!;
      expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(bedMm() - 6 + 1e-6);
      expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(bedMm() - 6 + 1e-6);
    }
    expect(out.warnings!.join(" ")).toMatch(/cauda de andorinha/);
  });

  test("as peças montadas somam o anel menos as folgas dos encaixes, sem sobrepor", () => {
    const p = { ...D, ...PLAIN };
    const { pieces: list, ringVolume: ring } = pieces(PLAIN);
    const total = list.reduce((s, q) => s + q.solid.volume(), 0);
    expect(total).toBeLessThan(ring);
    expect(total).toBeGreaterThan(ring * 0.995);
    expect(ring).toBeCloseTo(ringVolume(p), -2);
    // cada peça entra na seguinte sem sobrepor
    list.forEach((q, i) => expect(overlap(q.solid, list[(i + 1) % list.length].solid)).toBeLessThan(0.01));
    list.forEach((q) => q.solid.delete());
  });

  test("cada peça traz a cauda: passa do próprio trecho exatamente o comprimento do encaixe", () => {
    const { pieces: list } = pieces(PLAIN);
    const c1 = list[0].solid.boundingBox();
    expect(c1.max[0] - c1.min[0]).toBeCloseTo(D.width + TAIL_LEN, 1);
    list.forEach((q) => q.solid.delete());
  });

  test("o encaixe não sobrepõe: a cauda de uma peça não invade a seguinte", () => {
    const { pieces: list } = pieces(PLAIN);
    const a = list[0].solid;
    const b = list[1].solid;
    expect(overlap(a, b)).toBeLessThan(0.01);
    expect(a.volume()).toBeGreaterThan(0);
    expect(b.volume()).toBeGreaterThan(0);
    list.forEach((q) => q.solid.delete());
  });

  test("os cantos saem na cor dos cantos e os lados na cor da moldura", () => {
    const out = build(PLAIN);
    const colors = out.models.map((m) => m.parts[0].color);
    expect(colors.filter((c) => c === D.cornerColor)).toHaveLength(4);
    expect(colors.filter((c) => c === D.bodyColor).length).toBe(out.models.length - 4);
  });

  test("garras: uma por trecho de lado, com furo-piloto, e o desenho da garra tem o furo", () => {
    const out = build({ ...PLAIN, claws: true });
    const d = frameDims({ ...D, ...PLAIN });
    expect(out.models.filter((m) => m.name.startsWith("Garra "))).toHaveLength(2 * d.nSide + d.nTop + d.nBottom);
    const claw = out.models.find((m) => m.name.startsWith("Garra "))!;
    const b = meshBounds(claw.parts.map((x) => x.mesh))!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(2.5, 2);
    const bare = pieces(PLAIN);
    const drilled = pieces({ ...PLAIN, claws: true });
    expect(drilled.ringVolume).toBeLessThan(bare.ringVolume - 1);
    expect(drilled.ringVolume).toBeGreaterThan(bare.ringVolume - 700);
    [...bare.pieces, ...drilled.pieces].forEach((q) => q.solid.delete());
  });

  test("gancho: dois chaveiros no verso de cima tiram material do anel", () => {
    const bare = pieces(PLAIN);
    const hook = pieces({ ...PLAIN, back: "hook" });
    expect(hook.ringVolume).toBeLessThan(bare.ringVolume - 100);
    [...bare.pieces, ...hook.pieces].forEach((q) => q.solid.delete());
    expect(build({ ...PLAIN, back: "hook" }).warnings!.join(" ")).toMatch(/Gancho/);
  });

  test("apoio de mesa: perna presa por parafuso, o lado de cima fica com número ímpar de trechos", () => {
    const out = build({ ...PLAIN, back: "easel" });
    const leg = out.models.find((m) => m.name === "Perna do apoio")!;
    expect(volume(leg.parts[0].mesh)).toBeGreaterThan(500);
    expect(frameDims({ ...D, ...PLAIN, back: "easel" }).nTop % 2).toBe(1);
  });

  test("os perfis chanfrado e arredondado tiram material da frente e mantêm a altura", () => {
    const flat = build({ ...PLAIN, artW: 150, artH: 200, width: 20 });
    const chamfer = build({ ...PLAIN, artW: 150, artH: 200, width: 20, profile: "chamfer" });
    const round = build({ ...PLAIN, artW: 150, artH: 200, width: 20, profile: "round" });
    const vf = modelVolume(flat.models[0]);
    expect(modelVolume(chamfer.models[0])).toBeLessThan(vf - 50);
    expect(modelVolume(round.models[0])).toBeLessThan(vf - 20);
    for (const o of [chamfer, round]) expect(modelsBounds(o.models)!.max[2]).toBeCloseTo(D.depth, 2);
  });

  test("a moldura de 1 m sai em muitas peças e avisa que passa de uma mesa", () => {
    const out = build({ ...PLAIN, artW: 800, artH: 1000 });
    expect(out.models.length).toBeGreaterThan(16);
    for (const m of out.models) {
      const b = modelsBounds([m])!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(bedMm() - 6 + 1e-6);
    }
  });
});
