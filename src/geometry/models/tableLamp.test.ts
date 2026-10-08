import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildTableLamp, DEFAULT_TABLE_LAMP as D, shadeProfile, SOCKETS, type TableLampParams } from "./tableLamp";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: () => null });
const build = (p: Partial<TableLampParams> = {}) => buildTableLamp(ctx(), { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)!.mesh;
const solid = (m: ReturnType<typeof part>) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("luminária de mesa (#111)", { timeout: 60_000 }, () => {
  test("montada: base na mesa, cúpula em cima na altura pedida, as duas peças fechadas e sem se sobrepor", () => {
    const out = build();
    const base = part(out, "Base"), shade = part(out, "Cúpula");
    const bb = meshBounds([base])!, sb = meshBounds([shade])!;
    expect(bb.min[2]).toBeCloseTo(0);
    expect(sb.min[2]).toBeCloseTo(D.baseHeight);
    expect(sb.max[2] - sb.min[2]).toBeCloseTo(D.height, 0);
    const [a, b] = [solid(base), solid(shade)];
    expect(a.status()).toBe("NoError");
    expect(b.status()).toBe("NoError");
    const both = a.intersect(b);
    expect(both.volume()).toBeLessThan(1);
    [a, b, both].forEach((s) => s.delete());
  });

  test("maior diâmetro da cúpula = o pedido (pera)", () => {
    const sb = meshBounds([part(build({ shape: "cylinder", diameter: 140 }), "Cúpula")])!;
    expect(sb.max[0] - sb.min[0]).toBeCloseTo(140, 0);
  });

  test("bolso do soquete: E27 é mais largo que E14 e o anel cabe dentro da cúpula", () => {
    const wide = (socket: "E27" | "E14") => {
      const s = solid(part(build({ socket }), "Base"));
      // fatia na altura do bolso: o furo central tem o diâmetro do soquete + folga
      const cs = s.slice(D.baseHeight + 3);
      const polys = cs.toPolygons();
      const inner = polys.reduce((m, ring) => Math.min(m, Math.max(...ring.map((q) => Math.hypot(q[0], q[1])))), Infinity);
      cs.delete();
      s.delete();
      return inner * 2;
    };
    expect(wide("E27")).toBeCloseTo(SOCKETS.E27.body + D.socketClearance, 0);
    expect(wide("E14")).toBeCloseTo(SOCKETS.E14.body + D.socketClearance, 0);
  });

  test("passagem de cabo: a base tem um canal na mesa e um furo até o bolso", () => {
    const s = solid(part(build(), "Base"));
    const cs = s.slice(1);
    const area = cs.area();
    const full = Math.PI * (D.baseDiameter / 2) ** 2;
    expect(area).toBeLessThan(full - 50); // canal e furo tiram material
    cs.delete();
    s.delete();
  });

  test("texturas: ondas aumentam o raio, facetas fecham, furos tiram volume", () => {
    const v = (p: Partial<TableLampParams>) => volume(part(build(p), "Cúpula"));
    const plain = v({ texture: "none" });
    expect(v({ texture: "waves", textureSize: 4 })).toBeGreaterThan(plain);
    expect(v({ texture: "holes", textureSize: 6 })).toBeLessThan(plain);
    expect(meshBounds([part(build({ texture: "facets", textureCount: 6 }), "Cúpula")])!.max[0]).toBeGreaterThan(0);
  });

  test("perfil livre vale, e o fundo nunca fica estreito demais para o soquete", () => {
    const prof = shadeProfile({ ...D, shape: "free", profile: "5, 40, 60, 40" });
    expect(prof[0]).toBeGreaterThan((SOCKETS.E27.body + D.socketClearance) / 2);
    expect(() => build({ shape: "free", profile: "40, 50" })).toThrow(/perfil/);
  });

  test("base baixa demais para o soquete: erro com a altura mínima", () => {
    expect(() => build({ baseHeight: 20 })).toThrow(/Base baixa demais.*mm/);
  });

  test("avisos: LED sempre; folga da lâmpada quando a cúpula é estreita; balanço pede 'pronta para imprimir'", () => {
    expect(build().warnings!.join(" ")).toMatch(/lâmpada LED/);
    expect(build({ shape: "cylinder", diameter: 70 }).warnings!.join(" ")).toMatch(/da lâmpada E27/);
    const flare = { shape: "free" as const, profile: "30, 60, 90, 120", height: 40 };
    const sphere = build(flare).warnings!.join(" ");
    expect(sphere).toMatch(/Pronta para imprimir/);
    expect(build({ ...flare, layout: "print" }).warnings!.join(" ")).not.toMatch(/Pronta para imprimir/);
    expect(build({ shape: "sphere", diameter: 300, height: 50 }).warnings!.join(" ")).toMatch(/nos dois sentidos/);
  });

  test("pronta para imprimir: cúpula virada, apoiada na mesa e ao lado da base, sem sobrepor", () => {
    const out = build({ layout: "print" });
    const bb = meshBounds([part(out, "Base")])!, sb = meshBounds([part(out, "Cúpula")])!;
    expect(sb.min[2]).toBeCloseTo(0);
    expect(sb.min[0]).toBeGreaterThan(bb.max[0]);
    expect(sb.max[2] - sb.min[2]).toBeCloseTo(D.height, 0);
  });
});
