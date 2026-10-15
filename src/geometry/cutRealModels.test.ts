import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { fitRegionToPart } from "./cutFit";
import { runCuts, type CutItem } from "./cutSequence";
import { suggestCuts } from "./cutSuggest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { readOwnFile } from "./ownModel";
import { DEFAULT_PARTIAL_CUT } from "./partialCut";
import { modelVolume } from "./testUtil";
import type { Model } from "./types";

/** Modelos do tipo que a pessoa traz de verdade: boneco, miniatura com base, vaso oco, STL grande. */
let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const fixture = (n: string) => readOwnFile(new Uint8Array(readFileSync(join(__dirname, "../../tests/fixtures/stl", n))), n);
const wrap = (name: string, s: ReturnType<ManifoldToplevel["Manifold"]["cube"]>): Model => ({ name, parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(s) }] });
const cut = (p: Partial<CutItem>): CutItem => ({ ...DEFAULT_PARTIAL_CUT, color: null, ...p });
const closed = (r: ReturnType<typeof runCuts>) => {
  expect(r.report.ok).toBe(true);
  for (const m of r.models) for (const p of m.parts) expect(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices })).status()).toBe("NoError");
};

describe("modelos de verdade no corte parcial", () => {
  test("boneco com cabeça e braços: a cabeça sai inteira pela região ajustada e o encaixe fica escondido", () => {
    const boneco = fixture("boneco-braco.stl");
    const region = fitRegionToPart(M, boneco, { axis: "z", tilt: 0, offset: 31, region: null }, "cylinder", [8, 6, 40]);
    const r = runCuts(M, boneco, { cuts: [cut({ offset: 31, region })], restColor: null });
    closed(r);
    expect(r.models.map((m) => m.name.replace(/^.* · /, ""))).toEqual(["resto", "pedaço", "pinos"]);
    expect(r.pinIssues).toEqual([]);
    expect(r.warnings.join(" ")).not.toMatch(/pelo lado/);
  });

  test("boneco: a análise acha o braço no ar e o corte sugerido tira o suporte dele", () => {
    const s = suggestCuts(M, fixture("boneco-braco.stl"));
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].z).toBeCloseTo(18, 0);
    expect(s[0].after).toBeLessThan(s[0].before * 0.5); // sobra só a calota inclinada da cabeça
  });

  test("miniatura com base larga: corta só a figura e a base fica inteira, com pino", () => {
    const base = M.Manifold.cube([60, 60, 3]);
    const figura = M.Manifold.union([M.Manifold.cube([14, 10, 30]).translate([23, 25, 3]), M.Manifold.sphere(8, 24).translate([30, 30, 41])]);
    const mini = wrap("Miniatura", M.Manifold.union([base, figura]));
    const r = runCuts(M, mini, { cuts: [cut({ offset: 3.2, region: { kind: "box", min: [10, 10, 2], max: [50, 50, 60] }, pin: "round" })], restColor: null });
    closed(r);
    const baseOut = r.models.find((m) => m.name.endsWith("resto"))!;
    expect(modelVolume(baseOut)).toBeGreaterThan(60 * 60 * 3 - 150); // a base de 3 mm continua (menos o furo)
    expect(r.models.find((m) => m.name.endsWith("pedaço"))).toBeDefined();
  });

  test("vaso oco (parede fina): o corte no gargalo fecha e soma o volume", () => {
    const perfil: [number, number][] = [[0, 0], [25, 0], [30, 30], [18, 60], [20, 75], [18, 75], [16, 60], [27, 30], [22, 2], [0, 2]];
    const vaso = wrap("Vaso", new M.CrossSection([perfil], "NonZero").revolve(48));
    const r = runCuts(M, vaso, { cuts: [cut({ offset: 55, pin: "none", region: null })], restColor: null });
    closed(r);
    expect(r.models).toHaveLength(2);
  });

  test("STL grande (~500 mil triângulos): corta em tempo razoável e fecha", () => {
    const grande = wrap("Grande", M.Manifold.sphere(30, 1000));
    expect(grande.parts[0].mesh.indices.length / 3).toBeGreaterThan(400_000);
    const t0 = performance.now();
    const r = runCuts(M, grande, { cuts: [cut({ offset: 10, region: { kind: "sphere", center: [0, 0, 20], radius: 14 }, pin: "none" })], restColor: null });
    const ms = performance.now() - t0;
    closed(r);
    expect(ms).toBeLessThan(20_000);
  }, 60_000);
});
