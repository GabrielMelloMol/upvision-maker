import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { aromaCase, buildAroma, DEFAULT_AROMA, type AromaParams } from "./aromaKeychain";
import { screwCaseClosed } from "./screwCase";
import { testArt } from "./sampleArt";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const aroma = (p: Partial<AromaParams> = {}, c = ctx()) => buildAroma(c, { ...DEFAULT_AROMA, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (o: ReturnType<typeof aroma>, model: string, name: string) => o.models.find((m) => m.name === model)?.parts.find((x) => x.name === name);
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };

describe("chaveiro aromatizador: cápsula de rosca com feltro, furos e logo (#219)", { timeout: 60_000 }, () => {
  test("a rosca é a do Estojo: corpo e tampa fechados não se tocam, em várias folgas", () => {
    for (const clearance of [0.2, 0.35, 0.6]) {
      const { body, lid } = screwCaseClosed(ctx(), aromaCase({ ...DEFAULT_AROMA, clearance }));
      const both = body.intersect(lid);
      expect(both.volume(), `folga ${clearance}`).toBeLessThan(0.5);
      [body, lid, both].forEach((o) => o.delete());
    }
  });

  test("a cavidade cabe o feltro (Ø + 1 mm) e a altura dele com folga para o óleo", () => {
    const out = aroma({ feltDiameter: 30, feltThickness: 3 });
    const body = solid(part(out, "Corpo", "Corpo")!.mesh);
    // disco do feltro no fundo da cavidade (acima do piso): tudo vazio
    const felt = M.Manifold.cylinder(3, 15, 15, 64).translate([0, 0, DEFAULT_AROMA.floor + 0.01]);
    const hit = body.intersect(felt).volume();
    [body, felt].forEach((o) => o.delete());
    expect(hit).toBeLessThan(0.01);
  });

  test("furos de aroma: mais furos tiram mais material da tampa, e a tampa sai de pé na mesa", () => {
    const few = aroma({ holes: 4 });
    const many = aroma({ holes: 12 });
    expect(vol(part(many, "Tampa", "Tampa")!.mesh)).toBeLessThan(vol(part(few, "Tampa", "Tampa")!.mesh) - 1);
    const b = meshBounds([part(few, "Tampa", "Tampa")!.mesh])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
  });

  test("logo em relevo no meio da tampa (texto ou desenho), acima do teto, sem tapar os furos", () => {
    const withText = aroma();
    const logo = part(withText, "Tampa", "Logo")!;
    const lid = meshBounds([part(withText, "Tampa", "Tampa")!.mesh])!;
    const lb = meshBounds([logo.mesh])!;
    expect(lb.min[2]).toBeCloseTo(lid.max[2], 2); // apoiado no topo da tampa
    expect(lb.max[2] - lb.min[2]).toBeCloseTo(DEFAULT_AROMA.relief, 2);
    expect(part(aroma({}, ctx(testArt(M))), "Tampa", "Logo")).toBeDefined();
  });

  test("sem texto nem desenho não tem logo; o teste da rosca é só a rosca, pequena", () => {
    expect(part(aroma({ text: "" }), "Tampa", "Logo")).toBeUndefined();
    const full = aroma();
    const test = aroma({ print: "test" });
    expect(part(test, "Tampa", "Logo")).toBeUndefined();
    const size = (o: ReturnType<typeof aroma>) => { const b = meshBounds(o.models.flatMap((m) => m.parts.map((x) => x.mesh)))!; return b.max[0] - b.min[0]; };
    expect(size(test)).toBeLessThan(size(full) * 0.7);
  });

  test("olhal: o corpo ganha a orelha furada rente à mesa, só quando ligado", () => {
    const withEar = aroma({ keyring: true }), without = aroma({ keyring: false });
    const w = meshBounds([part(withEar, "Corpo", "Corpo")!.mesh])!, n = meshBounds([part(without, "Corpo", "Corpo")!.mesh])!;
    expect(w.max[0] - w.min[0]).toBeGreaterThan(n.max[0] - n.min[0] + 5);
    const s = solid(part(withEar, "Corpo", "Corpo")!.mesh);
    const hole = M.Manifold.cylinder(2, 0.5, 0.5, 8).translate([n.max[0] - 3 + 12 + 6, 0, 0.5]); // centro do furo do olhal
    expect(s.intersect(hole).volume()).toBeLessThan(0.01);
    [s, hole].forEach((o) => o.delete());
  });

  test("folga pequena avisa e furos que não cabem avisam", () => {
    expect(aroma({ clearance: 0.1 }).warnings?.join(" ")).toMatch(/Folga pequena/);
    expect(aroma({ feltDiameter: 8, holeDiameter: 4 }).warnings?.join(" ")).toMatch(/não cabem/);
    expect(aroma().warnings).toEqual([]);
  });
});
