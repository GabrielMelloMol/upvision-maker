import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildDrainCover, buildFunnel, buildORing, buildSeal, DEFAULT_DRAIN_COVER, DEFAULT_FUNNEL, DEFAULT_ORING, DEFAULT_SEAL, type DrainCoverParams, type FunnelParams, type ORingParams, type SealParams } from "./workshop";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: () => null });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const mesh = (o: { models: { parts: { mesh: Mesh }[] }[] }) => o.models[0].parts[0].mesh;
/** Raio externo e interno (menor raio dos furos) da seção a `z`. */
function radii(m: Mesh, z: number): { outer: number; inner: number } {
  const s = solid(m);
  const cs = s.slice(z);
  const polys = cs.toPolygons();
  const rs = polys.map((poly) => ({ max: Math.max(...poly.map((q) => Math.hypot(q[0], q[1]))), min: Math.min(...poly.map((q) => Math.hypot(q[0], q[1]))), area: poly.reduce((a, q, i) => a + (q[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * q[1]) / 2, 0) }));
  const outer = Math.max(...rs.map((r) => r.max));
  const hole = rs.filter((r) => r.area < 0);
  const inner = hole.length ? Math.max(...hole.map((r) => r.max)) : rs.length > 1 ? Math.min(...rs.map((r) => r.min)) : 0;
  [s, cs].forEach((o) => o.delete());
  return { outer, inner };
}
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };

const drain = (p: Partial<DrainCoverParams> = {}) => buildDrainCover(ctx(), { ...DEFAULT_DRAIN_COVER, ...p });
const funnel = (p: Partial<FunnelParams> = {}) => buildFunnel(ctx(), { ...DEFAULT_FUNNEL, ...p });
const oring = (p: Partial<ORingParams> = {}) => buildORing(ctx(), { ...DEFAULT_ORING, ...p });
const seal = (p: Partial<SealParams> = {}) => buildSeal(ctx(), { ...DEFAULT_SEAL, ...p });

describe("tampa de ralo (#231)", { timeout: 60_000 }, () => {
  test("o pino é o diâmetro do ralo menos a folga dos dois lados; a aba passa do ralo; o cone de baixo é de 45°", () => {
    const p = DEFAULT_DRAIN_COVER;
    const m = mesh(drain());
    const pin = radii(m, p.plugDepth / 2);
    expect(pin.outer * 2).toBeCloseTo(p.drainD - 2 * p.clearance, 1);
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(p.drainD + 2 * p.overhang, 1);
    const r1 = radii(m, p.plugDepth + 1).outer, r2 = radii(m, p.plugDepth + 2).outer;
    expect(r2 - r1).toBeLessThanOrEqual(1.02); // 45° ou mais íngreme: sem suporte
    expect(r2 - r1).toBeGreaterThan(0.9);
  });

  test("sem pino ('cobre') é só a aba e o botão; o botão soma a altura e fica no meio", () => {
    const cover = drain({ style: "cover", knob: true });
    const plain = drain({ style: "cover", knob: false });
    const hc = meshBounds([mesh(cover)])!, hp = meshBounds([mesh(plain)])!;
    expect(hp.max[2]).toBeCloseTo(DEFAULT_DRAIN_COVER.thickness, 2);
    expect(hc.max[2] - hp.max[2]).toBeCloseTo(6 + 4 + 3, 0); // haste + cone + tampa do botão
    expect(radii(mesh(cover), hp.max[2] + 1).outer).toBeLessThan(6);
  });

  test("com furos: o favo deixa passar a água, sem furo no botão nem na borda; a peça fica inteira", () => {
    const s = drain({ style: "strainer" });
    const full = vol(mesh(drain({ style: "cover" })));
    expect(vol(mesh(s))).toBeLessThan(full * 0.97);
    const body = solid(mesh(s));
    expect(body.decompose().length).toBe(1);
    // sob o botão e na borda é maciço
    const centre = M.Manifold.cylinder(1, 9, 9, 24).translate([0, 0, 1]);
    expect(body.intersect(centre).volume()).toBeGreaterThan(0.99 * centre.volume());
    [body, centre].forEach((o) => o.delete());
    expect(drain({ style: "strainer", drainD: 20, overhang: 2, holeD: 4 }).warnings?.join(" ")).toMatch(/Não coube nenhum furo/);
  });

  test("avisa de folga pequena e de tampa maior que a mesa", () => {
    expect(drain({ clearance: 0.1 }).warnings?.join(" ")).toMatch(/Folga pequena/);
    expect(drain({ drainD: 300, overhang: 10 }).warnings?.join(" ")).toMatch(/passa da mesa/);
    expect(drain().warnings).toEqual([]);
  });
});

describe("funil (#231)", { timeout: 60_000 }, () => {
  test("sai de cabeça para baixo (boca larga na mesa), com as medidas de fora e o bico da parede pedida", () => {
    const p = DEFAULT_FUNNEL;
    const m = mesh(funnel({ bead: false }));
    const b = meshBounds([m])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(p.neckLen + p.coneH, 2);
    expect(radii(m, 0.02).outer * 2).toBeCloseTo(p.topD, 1); // boca na mesa
    const neck = radii(m, p.neckLen + p.coneH - p.neckLen / 2); // meio do bico (no alto)
    expect(neck.outer * 2).toBeCloseTo(p.neckD, 1);
    expect(neck.inner * 2).toBeCloseTo(p.neckD - 2 * p.wall, 1);
  });

  test("o eixo todo fica livre para o líquido passar e a peça é uma só", () => {
    const body = solid(mesh(funnel()));
    const bore = M.Manifold.cylinder(200, DEFAULT_FUNNEL.neckD / 2 - DEFAULT_FUNNEL.wall - 0.05, DEFAULT_FUNNEL.neckD / 2 - DEFAULT_FUNNEL.wall - 0.05, 48).translate([0, 0, -50]);
    expect(body.intersect(bore).volume()).toBeLessThan(0.05);
    expect(body.decompose().length).toBe(1);
    [body, bore].forEach((o) => o.delete());
  });

  test("a borda reforçada alarga a boca; cone de mais de 45° avisa; bico estreito avisa", () => {
    const bead = meshBounds([mesh(funnel({ bead: true }))])!, plain = meshBounds([mesh(funnel({ bead: false }))])!;
    expect(bead.max[0] - bead.min[0]).toBeCloseTo(plain.max[0] - plain.min[0] + 5, 1);
    expect(funnel().warnings).toEqual([]);
    expect(funnel({ topD: 120, coneH: 20 }).warnings?.join(" ")).toMatch(/passa de 45°/);
    expect(funnel({ neckD: 5, wall: 1.6 }).warnings?.join(" ")).toMatch(/bico ficou estreito/);
  });
});

describe("O-ring (#231)", { timeout: 60_000 }, () => {
  test("o volume é o do toro (2π²·R·r²) sem achatar, e o diâmetro interno é o pedido", () => {
    const p = { ...DEFAULT_ORING, flat: false, quantity: 1 };
    const m = mesh(oring(p));
    const R = p.innerD / 2 + p.cord / 2, r = p.cord / 2;
    expect(vol(m) / (2 * Math.PI ** 2 * R * r * r)).toBeGreaterThan(0.99);
    expect(vol(m) / (2 * Math.PI ** 2 * R * r * r)).toBeLessThan(1.01);
    const hole = M.Manifold.cylinder(10, p.innerD / 2 - 0.05, p.innerD / 2 - 0.05, 96).translate([0, 0, -2]);
    const s = solid(m);
    expect(s.intersect(hole).volume()).toBeLessThan(0.05);
    [s, hole].forEach((o) => o.delete());
  });

  test("achatado: apoia na mesa (z = 0), tem 76% da seção de altura e perde pouco material", () => {
    const flat = mesh(oring({ quantity: 1 })), round = mesh(oring({ quantity: 1, flat: false }));
    const b = meshBounds([flat])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(DEFAULT_ORING.cord * 0.76, 2);
    expect(vol(flat) / vol(round)).toBeGreaterThan(0.85);
    expect(vol(flat) / vol(round)).toBeLessThan(0.99);
  });

  test("várias peças em grade, todas separadas; avisos de seção fina, anel apertado e do que o TPU não faz", () => {
    const four = solid(mesh(oring({ quantity: 4 })));
    expect(four.decompose().length).toBe(4);
    four.delete();
    expect(oring({ cord: 1 }).warnings?.join(" ")).toMatch(/Seção abaixo de 1,2/);
    expect(oring({ innerD: 6, cord: 3 }).warnings?.join(" ")).toMatch(/duro de esticar/);
    expect(oring().warnings?.join(" ")).toMatch(/não garante vedação/);
    expect(oring({ innerD: 100, cord: 5, quantity: 100 }).warnings?.join(" ")).toMatch(/passam da mesa/);
  });
});

describe("retentor (#231)", { timeout: 60_000 }, () => {
  test("o corpo prende no alojamento (+0,2), o lábio aperta o eixo e o resto do furo é maior que o eixo", () => {
    const p = DEFAULT_SEAL;
    const m = mesh(seal());
    expect(radii(m, 1).outer).toBeCloseTo(p.housingD / 2 + 0.2, 2);
    const shaft = M.Manifold.cylinder(p.width + 2, p.shaftD / 2, p.shaftD / 2, 96).translate([0, 0, -1]);
    const s = solid(m);
    const squeeze = s.intersect(shaft).volume();
    expect(squeeze).toBeGreaterThan(5); // o lábio entra no eixo
    // só o lábio toca: um eixo 0,5 mm mais fino não é tocado em cima, onde o furo é maior
    const high = radii(m, p.width - 0.3).inner;
    expect(high).toBeGreaterThan(p.shaftD / 2 + 0.5);
    [s, shaft].forEach((o) => o.delete());
    expect(radii(m, 2.8).inner).toBeCloseTo(p.shaftD / 2 - p.interference, 1); // na altura da ponta do lábio
  });

  test("lábio por baixo em 45° ou mais: sem suporte; peça inteira numa só; apoia na mesa", () => {
    const m = mesh(seal());
    const b = meshBounds([m])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(DEFAULT_SEAL.width, 2);
    const r1 = radii(m, 1.2).inner, r2 = radii(m, 1.8).inner;
    expect(Math.abs(r2 - r1) / 0.6).toBeLessThanOrEqual(1.05);
    const s = solid(m);
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("avisos: pouca diferença entre eixo e alojamento, retentor fino e o limite de uso", () => {
    expect(seal({ shaftD: 30, housingD: 34 }).warnings?.join(" ")).toMatch(/Pouca diferença/);
    expect(seal({ width: 2 }).warnings?.join(" ")).toMatch(/muito fino/);
    expect(seal().warnings?.join(" ")).toMatch(/não segura pressão/);
  });
});
