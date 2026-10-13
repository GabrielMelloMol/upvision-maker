import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { DEFAULT_PARTIAL_CUT } from "./partialCut";
import { runCuts, type CutItem } from "./cutSequence";
import { read3mf } from "./threemfRead";
import { filamentPlan, write3mf } from "./threemf";
import { modelVolume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const cube = (w: number, d: number, h: number, x = 0) => M.Manifold.cube([w, d, h]).translate([x, 0, 0]);
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const scene = (): Model => ({ name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([cube(20, 20, 40), cube(20, 20, 40, 40)])) }] });
const cut = (x0: number, x1: number, color: string | null = null): CutItem => ({ ...DEFAULT_PARTIAL_CUT, offset: 30, pin: "none", region: { kind: "box", min: [x0, -5, 20], max: [x1, 25, 50] }, color });

describe("vários cortes no mesmo arquivo", () => {
  test("dois cortes: um pedaço de cada bloco, o resto sem os dois topos e a soma volta ao original", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25), cut(35, 65)], restColor: null });
    expect(r.models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço 1", "Cena · pedaço 2"]);
    expect(modelVolume(r.models[1])).toBeCloseTo(4000, 1);
    expect(modelVolume(r.models[2])).toBeCloseTo(4000, 1);
    expect(modelVolume(r.models[0])).toBeCloseTo(2 * 16000 - 8000, 1);
    expect(r.report.ok).toBe(true);
    expect(r.report.sum).toBeCloseTo(r.report.original, 1);
  });

  test("um corte só mantém os nomes simples; sem peça acima do plano o erro cita o número do corte", () => {
    expect(runCuts(M, scene(), { cuts: [cut(-5, 25)], restColor: null }).models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço"]);
    expect(() => runCuts(M, scene(), { cuts: [cut(-5, 25), cut(-5, 25)], restColor: null })).toThrow(/Corte 2:/);
  });

  test("com pino, cada corte gera o seu pino", () => {
    const withPins = (c: CutItem): CutItem => ({ ...c, pin: "round" });
    const r = runCuts(M, scene(), { cuts: [withPins(cut(-5, 25)), withPins(cut(35, 65))], restColor: null });
    expect(r.models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço 1", "Cena · pedaço 2", "Cena · pinos 1", "Cena · pinos 2"]);
    expect(r.report.ok).toBe(true);
  });

  test("o segundo corte vale no que sobrou: a árvore intacta no resto do corte 1", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25)], restColor: null });
    expect(solid(r.models[0].parts[0].mesh).intersect(cube(20, 20, 40, 40)).volume()).toBeCloseTo(16000, 1);
  });
});

describe("cor por pedaço no 3MF", () => {
  const colors = { a: "#e11d48", b: "#2563eb", rest: "#16a34a" };
  test("cada objeto sai na cor escolhida e o 3MF lido de volta tem um extrusor por cor", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25, colors.a), cut(35, 65, colors.b)], restColor: colors.rest });
    expect(r.models.map((m) => m.parts[0].color)).toEqual([colors.rest, colors.a, colors.b]);
    const file = read3mf(write3mf(r.models, {}));
    const byObject = file.objects.map((o) => o.parts[0].extruder);
    expect(new Set(byObject).size).toBe(3);
    expect(filamentPlan(r.models).filamentColors.map((c) => c.toLowerCase())).toEqual(expect.arrayContaining(Object.values(colors)));
  });

  test("sem cor escolhida o pedaço mantém a cor do arquivo; a prévia destaca em cores diferentes", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25), cut(35, 65)], restColor: null });
    expect(r.models[1].parts[0].color).toBe("#d4d4d8");
    const [p1, p2] = r.preview.filter((m) => m.name.startsWith("Pedaço"));
    expect(p1.parts[0].color).not.toBe(p2.parts[0].color);
  });
});
