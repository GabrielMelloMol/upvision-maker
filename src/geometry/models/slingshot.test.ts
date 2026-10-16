import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildSlingshot, DEFAULT_SLINGSHOT, type SlingshotParams } from "./slingshot";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const sling = (p: Partial<SlingshotParams> = {}) => buildSlingshot(ctx(), { ...DEFAULT_SLINGSHOT, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (o: ReturnType<typeof sling>, n: string) => o.models[0].parts.find((x) => x.name === n);
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };
const P = DEFAULT_SLINGSHOT;

describe("estilingue personalizado (#238)", { timeout: 60_000 }, () => {
  test("peça única em Y: as pontas ficam na distância pedida, simétricas, e a altura é a do cabo mais a forquilha", () => {
    const m = part(sling(), "Estilingue")!.mesh;
    const b = meshBounds([m])!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(P.thickness, 2);
    expect(b.max[0] + b.min[0]).toBeCloseTo(0, 1); // simétrico
    expect(b.max[0] - b.min[0]).toBeCloseTo(P.spread + P.armW, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo(P.handleLen + P.forkLen + P.armW, 0);
    const s = solid(m);
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("furos de amarração nas pontas e na ponta do cabo são livres, e há parede em volta dos furos das pontas", () => {
    const s = solid(part(sling(), "Estilingue")!.mesh);
    const tipY = P.handleLen + P.forkLen;
    const probe = (x: number, y: number, r: number) => M.Manifold.cylinder(P.thickness + 2, r, r, 24).translate([x, y, -1]);
    for (const x of [-P.spread / 2, P.spread / 2]) {
      const hole = probe(x, tipY, 3.1), wall = probe(x, tipY, 3.9);
      expect(s.intersect(hole).volume()).toBeLessThan(0.05);
      expect(s.intersect(wall).volume()).toBeGreaterThan(5);
      [hole, wall].forEach((o) => o.delete());
    }
    const lanyard = probe(0, 10, 3.9);
    expect(s.intersect(lanyard).volume()).toBeLessThan(0.05);
    [s, lanyard].forEach((o) => o.delete());
  });

  test("nome: em relevo vira parte de outra cor no topo; gravado tira material; sem nome não muda", () => {
    const raised = sling({ nameMode: "raised" });
    const nb = meshBounds([part(raised, "Nome")!.mesh])!;
    expect(nb.min[2]).toBeCloseTo(P.thickness, 2);
    expect(nb.max[2]).toBeCloseTo(P.thickness + P.depth, 2);
    expect(Math.abs(nb.max[0] + nb.min[0])).toBeLessThan(1); // no meio do cabo
    expect(nb.max[1]).toBeLessThan(P.handleLen); // fica na empunhadura, não na forquilha
    const none = vol(part(sling({ nameMode: "none" }), "Estilingue")!.mesh);
    expect(vol(part(sling({ nameMode: "engraved" }), "Estilingue")!.mesh)).toBeLessThan(none - 5);
    expect(vol(part(raised, "Estilingue")!.mesh)).toBeCloseTo(none, 0);
    expect(part(sling({ name: "" }), "Nome")).toBeUndefined();
  });

  test("avisos: braço fino, pontas juntas, maior que a mesa; o aviso de cuidados sempre aparece", () => {
    expect(sling({ armW: 10 }).warnings!.join(" ")).toMatch(/Braço fino/);
    expect(sling({ spread: 20 }).warnings!.join(" ")).toMatch(/muito juntas/);
    expect(sling({ forkLen: 200, handleLen: 120 }).warnings!.join(" ")).toMatch(/passa da mesa/);
    const base = sling().warnings!;
    expect(base).toHaveLength(1);
    expect(base[0]).toMatch(/Brinquedo e hobby.*PETG ou ABS.*óculos.*não aponte para pessoas ou animais.*adulto/);
  });
});
