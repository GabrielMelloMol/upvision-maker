import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildWindowFrame, DEFAULT_WINDOW_FRAME as D, type WindowFrameParams } from "./windowFrame";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<WindowFrameParams> = {}) => buildWindowFrame(ctx(), { ...D, ...p });
/** Área da seção horizontal da peça na altura z. */
const sliceArea = (m: Mesh, z: number) => {
  const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
  const a = s.slice(z).area();
  s.delete();
  return a;
};

describe("peças com janela (#56)", { timeout: 30_000 }, () => {
  test("shaker: fundo fechado, câmara, ranhura mais larga para o acetato e pausa antes da aba", () => {
    const { models, pauses, warnings } = build({ mount: "stand" });
    const frame = models[0].parts[0].mesh;
    const gap = D.sheet + D.clearance;
    const chamberTop = D.back + D.chamber;
    expect(pauses).toEqual([Math.round(Math.ceil((chamberTop + gap) / 0.2 - 1e-6) * 0.2 * 1000) / 1000]);
    expect(warnings!.join(" ")).toMatch(/glitter/);
    const full = Math.PI * 40 ** 2;
    expect(sliceArea(frame, D.back / 2)).toBeCloseTo(full, -2); // fundo cheio
    const wall = sliceArea(frame, D.back + D.chamber / 2);
    const slot = sliceArea(frame, chamberTop + gap / 2);
    expect(slot).toBeLessThan(wall - 100); // a ranhura come a parede por dentro
    expect(sliceArea(frame, chamberTop + gap + D.lip / 2)).toBeCloseTo(wall, -1); // a aba volta a prender
    expect(meshBounds([frame])!.max[2]).toBeCloseTo(chamberTop + gap + D.lip);
  });

  test("tecido: aro sem fundo e pausa na altura escolhida", () => {
    const { models, pauses } = build({ kind: "fabric", fabricAt: 1.2, mount: "stand" });
    expect(pauses).toEqual([1.2]);
    expect(sliceArea(models[0].parts[0].mesh, 0.6)).toBeLessThan(Math.PI * 40 ** 2 * 0.3); // janela aberta
  });

  test("topo de bolo ganha palitos; nome sai à parte; moldura pode contornar um texto", () => {
    const { models } = build();
    const b = meshBounds([models[0].parts[0].mesh])!;
    expect(b.min[1]).toBeLessThan(-40 - 50); // palitos descem
    expect(models.map((m) => m.name)).toEqual(["Janela", "Ana"]);
    const txt = build({ shape: "text", shapeText: "15", mount: "hang" }).models[0].parts[0].mesh;
    expect(meshBounds([txt])!.max[0]).toBeGreaterThan(0);
  });
});
