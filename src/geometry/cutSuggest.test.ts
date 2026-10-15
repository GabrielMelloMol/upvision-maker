import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { overhangArea, suggestCuts } from "./cutSuggest";
import { runCuts } from "./cutSequence";
import { DEFAULT_PARTIAL_CUT } from "./partialCut";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const model = (s: ReturnType<ManifoldToplevel["Manifold"]["cube"]>): Model => ({ name: "Teste", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(s) }] });
const cube = (w: number, d: number, h: number, x = 0, y = 0, z = 0) => M.Manifold.cube([w, d, h]).translate([x, y, z]);

/** Boneco com um braço esticado de lado: o braço é uma aba no ar a 20 mm da mesa. */
const withArm = () => model(M.Manifold.union([cube(20, 20, 40), cube(30, 8, 6, 20, 6, 20)]));

describe("sugestão de corte para menos suporte", () => {
  test("um cubo liso não tem saliência: nada a sugerir", () => {
    expect(overhangArea([toMesh(M.Manifold.cube([20, 20, 20]))])).toBe(0);
    expect(suggestCuts(M, model(M.Manifold.cube([20, 20, 20])))).toEqual([]);
  });

  test("braço esticado: mede a área no ar e acha o plano logo abaixo dele", () => {
    const m = withArm();
    expect(overhangArea(m.parts.map((p) => p.mesh))).toBeCloseTo(30 * 8, 0); // a face de baixo do braço
    const s = suggestCuts(M, m);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].z).toBeCloseTo(20, 0);
    expect(s[0].after).toBeLessThan(s[0].before * 0.1);
  });

  test("a região sugerida corta mesmo: o pedaço do braço assenta na mesa sem suporte e a soma fecha", () => {
    const m = withArm();
    const [s] = suggestCuts(M, m);
    const r = runCuts(M, m, { cuts: [{ ...DEFAULT_PARTIAL_CUT, offset: s.z, region: { kind: "box", ...s.region }, pin: "none", color: null }], restColor: null });
    expect(r.report.ok).toBe(true);
    expect(overhangArea(r.models.flatMap((x) => x.parts.map((p) => p.mesh)))).toBeLessThan(1);
  });

  test("uma aba bem pequena não vira sugestão", () => {
    const tiny = model(M.Manifold.union([cube(20, 20, 40), cube(4, 1, 3, 20, 6, 20)]));
    expect(suggestCuts(M, tiny)).toEqual([]);
  });
});
