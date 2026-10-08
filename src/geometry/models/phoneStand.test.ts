import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { modelVolume, volume } from "../testUtil";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildPhoneStand, DEFAULT_PHONE_STAND as D, standProfile, STAND_BASE, STAND_CLEARANCE, type PhoneStandParams } from "./phoneStand";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const build = (p: Partial<PhoneStandParams> = {}, c: ModelCtx = ctx()) => buildPhoneStand(c, { ...D, ...p });
const raw = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
/** A peça no sistema da conta (frente em +Y): o app entrega com a frente em −Y (girada 180° em Z). */
const solid = (m: Mesh): Solid => {
  const r = raw(m);
  const out = r.rotate([0, 0, 180]);
  r.delete();
  return out;
};

/** Um "aparelho": placa de espessura t e comprimento 120 com a quina de trás-embaixo no ponto de apoio, deitada no apoio. */
function device(angle: number, t: number): Solid {
  const a = (angle * Math.PI) / 180;
  const slab = M.Manifold.cube([60, t, 120]).translate([-30, 0, 0]);
  const placed = slab.transform([1, 0, 0, 0, 0, Math.sin(a), Math.cos(a), 0, 0, -Math.cos(a), Math.sin(a), 0, 0, 0, STAND_BASE, 1]);
  slab.delete();
  return placed;
}
const overlap = (mesh: Mesh, other: Solid) => {
  const a = solid(mesh);
  const i = a.intersect(other);
  const v = i.volume();
  [a, i].forEach((o) => o.delete());
  return v;
};

describe("suporte de celular e tablet (#110)", { timeout: 60_000 }, () => {
  test("largura pedida, apoiado na mesa e com a altura do apoio por cima da base", () => {
    const { models } = build({ text: "" });
    const b = modelsBounds(models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.width, 2);
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(STAND_BASE + D.height, 2);
  });

  test.each([45, 55, 60, 75])("inclinação de %s°: o topo do apoio recua altura ÷ tan(ângulo)", (angle) => {
    const { models } = build({ angle, text: "", cable: 0 });
    const body = models[0].parts[0].mesh;
    const P = body.positions;
    let top = Infinity;
    const zTop = STAND_BASE + D.height;
    for (let i = 0; i < P.length; i += 3) if (P[i + 2] > zTop - 1e-3) top = Math.min(top, -P[i + 1]); // frente em −Y: o topo recua para +Y
    expect(top).toBeCloseTo(-D.height / Math.tan((angle * Math.PI) / 180), 2);
  });

  test.each([45, 60, 75])("a fenda é do aparelho: placa da espessura pedida cabe sem encostar (%s°); 2 mm mais grossa bate no lábio", (angle) => {
    const t = D.deviceThickness;
    const { models } = build({ angle, text: "", cable: 0 });
    const body = models[0].parts[0].mesh;
    const fits = device(angle, t);
    const tight = device(angle, t + STAND_CLEARANCE + 1.5);
    expect(overlap(body, fits)).toBeLessThan(0.5);
    expect(overlap(body, tight)).toBeGreaterThan(5);
    [fits, tight].forEach((o) => o.delete());
  });

  test("tablet grosso (espessura 18): a fenda acompanha e o lábio sobe para alcançar o canto da frente", () => {
    const { models, warnings } = build({ deviceThickness: 18, angle: 45, lip: 6, text: "", cable: 0 });
    const g = standProfile({ ...D, deviceThickness: 18, angle: 45, lip: 6 });
    expect(g.lipHeight).toBeGreaterThan(6);
    const slab = device(45, 18);
    expect(overlap(models[0].parts[0].mesh, slab)).toBeLessThan(0.5);
    slab.delete();
    expect(warnings!.join(" ")).toMatch(/Lábio aumentado/);
    expect(warnings!.join(" ")).toMatch(/Tablet ou aparelho grosso/);
  });

  test("passagem de cabo: furo sob o aparelho e canal embaixo, e o suporte continua uma peça só", () => {
    const withCable = build({ cable: 16, text: "" }).models[0].parts[0].mesh;
    const without = build({ cable: 0, text: "" }).models[0].parts[0].mesh;
    expect(volume(withCable)).toBeLessThan(volume(without));
    const s = solid(withCable);
    expect(s.decompose().map((x) => x.delete()).length).toBe(1);
    s.delete();
    // o furo atravessa a base na vertical, bem no meio: um raio que desce pelo centro não encontra material no vão do assento
    const g = standProfile(D);
    const probe = M.Manifold.cube([2, 2, 20]).translate([-1, (0.6 + g.lipRear - 0.6) / 2 - 1, -5]);
    expect(overlap(withCable, probe)).toBeLessThan(0.01);
    expect(overlap(without, probe)).toBeGreaterThan(1);
    probe.delete();
  });

  test("cabo mais largo que o suporte deixa parede dos dois lados", () => {
    const m = build({ width: 50, cable: 25, text: "" }).models[0].parts[0].mesh;
    const s = solid(m);
    expect(s.decompose().map((x) => x.delete()).length).toBe(1);
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(50, 2);
    s.delete();
  });

  test("nome em relevo na frente: parte à parte, para fora do lábio, dentro da face e lendo certo", () => {
    const { models } = build({ text: "AB", relief: 0.8 });
    const [body, text] = models[0].parts;
    expect(text.name).toBe("Texto");
    const g = standProfile(D);
    const tb = meshBounds([text.mesh])!;
    expect(tb.max[1]).toBeCloseTo(-g.lipFront, 3); // a frente é −Y: o relevo sai para −Y
    expect(tb.min[1]).toBeCloseTo(-(g.lipFront + 0.8), 3);
    expect(tb.min[2]).toBeGreaterThan(0);
    expect(tb.max[2]).toBeLessThan(STAND_BASE + g.lipHeight);
    expect(modelVolume({ name: "x", parts: [body] })).toBeGreaterThan(0);
    expect(body.color).not.toBe(text.color);
    // não entra no corpo
    expect(overlap(body.mesh, solid(text.mesh))).toBeLessThan(0.01);
  });

  test("a frente é −Y (como no resto do app): o lábio fica no lado de −Y e o apoio recua para +Y", () => {
    const b = modelsBounds(build({ text: "" }).models)!;
    const g = standProfile(D);
    expect(b.min[1]).toBeCloseTo(-g.lipFront, 3);
    expect(b.max[1]).toBeCloseTo(-g.back, 3);
  });

  test("o texto assimétrico lê certo de frente: o peso à direita de quem olha (de −Y) fica em +X", () => {
    const right = (s: string, h: number) => (s.trim() ? M.CrossSection.union([M.CrossSection.square([h * 0.1, h * 0.5], true).translate([-h * 0.9, 0]), M.CrossSection.square([h * 0.8, h * 0.5], true).translate([h * 0.4, 0])]) : null);
    const { models } = buildPhoneStand({ M, art: null, text: right }, { ...D, text: "F" });
    const s = raw(models[0].parts[1].mesh);
    const half = M.Manifold.cube([200, 200, 200]).translate([0, -100, -100]); // x > 0
    const i = s.intersect(half);
    const share = i.volume() / s.volume();
    [s, half, i].forEach((o) => o.delete());
    expect(share).toBeGreaterThan(0.6);
  });

  test("logo enviado vale no lugar do nome", () => {
    const art = M.CrossSection.circle(5, 24);
    const { models } = build({ text: "" }, ctx(art));
    expect(models[0].parts.map((p) => p.name)).toEqual(["Suporte", "Texto"]);
  });

  test("sem nome nem logo: uma parte só; avisos de impressão e de mesa", () => {
    const plain = build({ text: "" });
    expect(plain.models[0].parts).toHaveLength(1);
    expect(plain.warnings!.join(" ")).toMatch(/de pé na base/);
    expect(build({ angle: 60 }).warnings!.join(" ")).not.toMatch(/Ângulo baixo/);
    expect(build({ angle: 45 }).warnings!.join(" ")).toMatch(/Ângulo baixo/);
    expect(build({ width: 300 }).warnings!.join(" ")).toMatch(/passa da mesa/);
  });

  test("sem apoio abaixo de 45° da mesa: nenhuma parte da peça inclina além do limite sem suporte (ângulo 45 a 75)", () => {
    for (const angle of [45, 60, 75]) {
      const mesh = build({ angle, text: "", cable: 0 }).models[0].parts[0].mesh;
      const P = mesh.positions;
      let bad = 0;
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = [mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3];
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
        const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const len = Math.hypot(n[0], n[1], n[2]);
        const z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        if (len > 0 && n[2] / len < -Math.cos(Math.PI / 4) - 1e-6 && z > 0.3) bad++;
      }
      expect(bad, `${angle}°`).toBe(0);
    }
  });
});
