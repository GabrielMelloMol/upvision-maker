import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildCupHandle, cupDiameter, DEFAULT_CUP_HANDLE, handleLayout, type CupHandleParams } from "./cupHandle";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const handle = (p: Partial<CupHandleParams> = {}) => buildCupHandle(ctx(), { ...DEFAULT_CUP_HANDLE, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (o: ReturnType<typeof handle>, name: string) => o.models.flatMap((m) => m.parts).find((x) => x.name === name);
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };
/** O copo (cone cheio) com `grow` mm a mais no raio, apoiado em z0. */
const cup = (p: CupHandleParams, grow: number): Solid => {
  const z0 = handleLayout(p).z0;
  return M.Manifold.cylinder(p.bodyHeight, p.baseDiameter / 2 + grow, p.topDiameter / 2 + grow, 128).translate([0, 0, z0]);
};

describe("alça de copo térmico: luva cônica, fundo, alça com nome e anel de teste (#221)", { timeout: 60_000 }, () => {
  test("o copo do perfil cabe sem tocar, em várias folgas, e o copo um pouco maior toca (a folga é real)", () => {
    for (const clearance of [0.3, 0.5, 0.8]) {
      const p = { ...DEFAULT_CUP_HANDLE, clearance };
      const body = solid(part(handle({ clearance }), "Alça")!.mesh);
      const exact = cup(p, 0), tight = cup(p, clearance + 0.3);
      expect(body.intersect(exact).volume(), `folga ${clearance}`).toBeLessThan(0.5);
      expect(body.intersect(tight).volume(), `copo maior ${clearance}`).toBeGreaterThan(5);
      [body, exact, tight].forEach((o) => o.delete());
    }
  });

  test("a luva acompanha o cone do copo: mais larga em cima que embaixo", () => {
    const p = DEFAULT_CUP_HANDLE;
    expect(cupDiameter(p, p.bodyHeight)).toBe(p.topDiameter);
    const body = solid(part(handle(), "Alça")!.mesh);
    const L = handleLayout(p);
    const slice = (z: number) => { const c = body.slice(z); const b = c.bounds(); c.delete(); return b; };
    const low = slice(L.sleeveBottom + 1), high = slice(L.sleeveTop - 1);
    body.delete();
    // o furo da luva (diâmetro interno) cresce: a seção de cima é mais larga que a de baixo na parede
    expect(high.max[1] - high.min[1]).toBeGreaterThan(low.max[1] - low.min[1] + 2);
  });

  test("tudo numa peça só (alça presa ao fundo e à luva) e o vão dos dedos fica vazio", () => {
    const out = handle();
    const s = solid(part(out, "Alça")!.mesh);
    expect(s.decompose().length).toBe(1);
    const L = handleLayout(DEFAULT_CUP_HANDLE);
    const mid = M.Manifold.cube([4, 4, 4], true).translate([L.rMaxOut + DEFAULT_CUP_HANDLE.fingerGap / 2, 0, L.sleeveTop / 2]);
    expect(s.intersect(mid).volume()).toBeLessThan(0.01);
    [s, mid].forEach((o) => o.delete());
    expect(out.warnings).toEqual([]);
  });

  test("nome: gravado tira material, em relevo vira parte própria, sem nome não muda", () => {
    const none = vol(part(handle({ nameMode: "none" }), "Alça")!.mesh);
    const engraved = handle({ nameMode: "engraved" });
    expect(vol(part(engraved, "Alça")!.mesh)).toBeLessThan(none - 1);
    expect(part(engraved, "Nome")).toBeUndefined();
    const raised = handle({ nameMode: "raised" });
    expect(part(raised, "Nome")).toBeDefined();
    expect(vol(part(raised, "Alça")!.mesh)).toBeCloseTo(none, 1);
    // o relevo está na frente da luva (lado -Y, a 90° da alça) e dentro da altura dela
    const nb = meshBounds([part(raised, "Nome")!.mesh])!;
    const L = handleLayout(DEFAULT_CUP_HANDLE);
    expect(nb.max[1]).toBeLessThan(0);
    expect(nb.min[2]).toBeGreaterThanOrEqual(L.sleeveBottom);
    expect(nb.max[2]).toBeLessThanOrEqual(L.sleeveTop);
    expect(Math.abs(nb.max[0] + nb.min[0])).toBeLessThan(1); // centrado na frente
    expect(vol(part(handle({ name: "" }), "Alça")!.mesh)).toBeCloseTo(none, 1);
  });

  test("anel de teste: uma luva curta com o mesmo furo do ponto do cone", () => {
    const out = handle({ print: "test" });
    expect(out.models.map((m) => m.name)).toEqual(["Anel de teste"]);
    const ring = part(out, "Anel de teste")!.mesh;
    const b = meshBounds([ring])!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(14, 1);
    const p = DEFAULT_CUP_HANDLE;
    // o furo de baixo do anel é o diâmetro do copo na altura da luva + folga
    const s = solid(ring);
    const c = s.slice(0.5);
    const inner = c.toPolygons().map((poly) => Math.min(...poly.map((q) => Math.hypot(q[0], q[1])))).reduce((a, v) => Math.min(a, v), Infinity);
    [s, c].forEach((o) => o.delete());
    expect(inner).toBeCloseTo(cupDiameter(p, p.gripZ) / 2 + p.clearance, 1);
    expect(out.warnings?.join(" ")).toMatch(/Anel de teste/);
    expect(b.max[2] - b.min[2]).toBeLessThan(handle().models[0].parts[0].mesh.positions.length); // só um sanity: o anel é bem menor que a peça
  });

  test("avisa quando a luva passa do topo do copo ou o copo é mais largo embaixo", () => {
    expect(handle({ gripZ: 240, sleeveHeight: 40 }).warnings?.join(" ")).toMatch(/passa do topo/);
    expect(handle({ baseDiameter: 100, topDiameter: 80 }).warnings?.join(" ")).toMatch(/mais largo embaixo/);
  });

  test("tamanhos extremos do formulário geram sem quebrar", () => {
    for (const p of [{ baseDiameter: 50, topDiameter: 60, bodyHeight: 120, gripZ: 20, sleeveHeight: 20 }, { baseDiameter: 120, topDiameter: 140, bodyHeight: 340, gripZ: 150, sleeveHeight: 60, fingerGap: 60 }]) {
      const out = handle(p);
      const s = solid(part(out, "Alça")!.mesh);
      expect(s.volume()).toBeGreaterThan(1000);
      s.delete();
    }
  });

  test("alça arredondada: a seção é oval (a borda da face some, o meio é cheio) e as marcas de dedo tiram material", () => {
    const L = handleLayout(DEFAULT_CUP_HANDLE);
    const xBar = L.rMaxOut + DEFAULT_CUP_HANDLE.fingerGap + 4; // meio da barra de fora
    const probe = (y: number, z: number) => M.Manifold.cube([7, 0.2, 1], true).translate([xBar, y, z]);
    const body = solid(part(handle({ grooves: false }), "Alça")!.mesh);
    const z = 40;
    const mid = body.intersect(probe(0, z)).volume(), edge = body.intersect(probe(DEFAULT_CUP_HANDLE.handleWidth / 2 - 0.2, z)).volume();
    body.delete();
    expect(mid).toBeGreaterThan(1); // no meio da largura a barra é cheia
    expect(edge).toBeLessThan(mid * 0.5); // na borda da face ela afina em arco
    expect(vol(part(handle({ grooves: true }), "Alça")!.mesh)).toBeLessThan(vol(part(handle({ grooves: false }), "Alça")!.mesh) - 5);
  });

  test("nome em relevo é o padrão (outra cor); copo fantasma só na prévia, translúcido e sem nome na legenda", () => {
    const out = handle();
    expect(part(out, "Nome")).toBeDefined();
    const ghost = out.models.find((m) => m.previewOnly)!;
    expect(ghost.parts[0].ghost).toBe(true);
    expect(ghost.parts[0].name).toBe("");
    const gb = meshBounds([ghost.parts[0].mesh])!;
    const L = handleLayout(DEFAULT_CUP_HANDLE);
    expect(gb.min[2]).toBeCloseTo(L.z0, 2); // assentado onde o copo fica
    expect(gb.max[2]).toBeGreaterThan(L.sleeveTop); // passa do topo da luva
    expect(gb.max[0] - gb.min[0]).toBeCloseTo(DEFAULT_CUP_HANDLE.baseDiameter + ((DEFAULT_CUP_HANDLE.topDiameter - DEFAULT_CUP_HANDLE.baseDiameter) * (gb.max[2] - L.z0)) / DEFAULT_CUP_HANDLE.bodyHeight, 0);
    expect(out.models.filter((m) => !m.previewOnly).map((m) => m.name)).toEqual(["Alça de copo"]);
    expect(handle({ showCup: false }).models.some((m) => m.previewOnly)).toBe(false);
    // o fantasma não toca a peça (o copo cabe com folga)
    const body = solid(part(out, "Alça")!.mesh), cupSolid = solid(ghost.parts[0].mesh);
    expect(body.intersect(cupSolid).volume()).toBeLessThan(0.5);
    [body, cupSolid].forEach((o) => o.delete());
  });

  test("luva vazada: furos redondos em volta (menos a frente e a alça); faixas somam relevo; luva baixa avisa; o copo continua cabendo", () => {
    const smooth = vol(part(handle({ nameMode: "none" }), "Alça")!.mesh);
    const cut = handle({ sleeveStyle: "cutouts", nameMode: "none" });
    expect(vol(part(cut, "Alça")!.mesh)).toBeLessThan(smooth - 100);
    const body = solid(part(cut, "Alça")!.mesh);
    expect(body.decompose().length).toBe(1);
    const exact = cup(DEFAULT_CUP_HANDLE, 0);
    expect(body.intersect(exact).volume()).toBeLessThan(0.5);
    [body, exact].forEach((o) => o.delete());
    const banded = handle({ sleeveStyle: "bands", nameMode: "none" });
    expect(vol(part(banded, "Alça")!.mesh)).toBeGreaterThan(smooth + 20);
    expect(handle({ sleeveStyle: "bands", sleeveHeight: 20 }).warnings?.join(" ")).toMatch(/luva é baixa/);
    // o nome em relevo cabe entre as faixas
    expect(part(handle({ sleeveStyle: "bands" }), "Nome")).toBeDefined();
  });
});
