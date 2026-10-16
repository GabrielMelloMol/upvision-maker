import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { gearRadii, spurSpec } from "./gears";
import {
  buildBelt, buildChain, buildPlanetary, buildPulley, buildSprocket, buildSpurGear,
  DEFAULT_BELT, DEFAULT_CHAIN, DEFAULT_PLANETARY, DEFAULT_PULLEY, DEFAULT_SPROCKET, DEFAULT_SPUR_GEAR, planetCount,
} from "./mechanics";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, artLayers: null, text: () => null });
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const valid = (m: Mesh) => expect(solid(m).status()).toBe("NoError");

describe("engrenagem (#230)", () => {
  test("par engrenado: peças válidas e sem interferência entre os dentes", () => {
    const { models, warnings } = buildSpurGear(ctx(), DEFAULT_SPUR_GEAR);
    const [a, b] = models[0].parts.map((x) => solid(x.mesh)) as [Solid, Solid];
    models[0].parts.forEach((x) => valid(x.mesh));
    expect(a.intersect(b).volume()).toBeLessThan(0.5);
    expect((warnings ?? []).join(" ")).toContain("1,80 : 1");
  });

  test("distância entre eixos = módulo × (z1 + z2) / 2", () => {
    const p = DEFAULT_SPUR_GEAR;
    const b = solid(buildSpurGear(ctx(), p).models[0].parts[1].mesh).boundingBox();
    const centre = (b.min[0] + b.max[0]) / 2;
    expect(centre).toBeCloseTo((p.module * (p.teeth + p.teeth2)) / 2, 0);
  });

  test("raio de fora = primitivo + addendum e o furo é respeitado", () => {
    const p = { ...DEFAULT_SPUR_GEAR, pair: false, hub: false };
    const g = solid(buildSpurGear(ctx(), p).models[0].parts[0].mesh);
    const r = gearRadii(spurSpec(p.teeth, p.module, p.pressure, p.backlash));
    expect(g.boundingBox().max[0]).toBeCloseTo(r.ra, 0);
    expect(g.intersect(M.Manifold.cylinder(p.thickness, p.bore / 2 - 0.1, p.bore / 2 - 0.1, 32)).volume()).toBeLessThan(1e-3);
  });

  test("poucos dentes gera aviso", () => {
    expect(buildSpurGear(ctx(), { ...DEFAULT_SPUR_GEAR, teeth: 7, pair: false }).warnings?.join(" ")).toContain("9 ou mais");
  });
});

describe("polia e correia (#230)", () => {
  test("polia GT2 de 20 dentes: diâmetro de fora ≈ 12,12 mm", () => {
    const p = { ...DEFAULT_PULLEY, flange: false, setScrew: false };
    const b = solid(buildPulley(ctx(), p).models[0].parts[0].mesh).boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo((20 * 2) / Math.PI - 0.254, 0);
  });

  test("com aba e cubo a peça é uma só e válida", () => {
    const mesh = buildPulley(ctx(), DEFAULT_PULLEY).models[0].parts[0].mesh;
    valid(mesh);
    expect(solid(mesh).decompose()).toHaveLength(1);
  });

  test("GT2 de 16 dentes com furo de 5 mm (a polia mais comum) não gera aviso de furo", () => {
    const { warnings } = buildPulley(ctx(), { ...DEFAULT_PULLEY, teeth: 16 });
    expect((warnings ?? []).join(" ")).not.toContain("furo é grande");
    expect((warnings ?? []).join(" ")).toContain("Polia de 16 dentes");
  });

  test("correia: comprimento = dentes × passo e aviso de TPU", () => {
    const { models, warnings } = buildBelt(ctx(), DEFAULT_BELT);
    valid(models[0].parts[0].mesh);
    expect((warnings ?? []).join(" ")).toContain("120 mm");
    expect((warnings ?? []).join(" ")).toContain("TPU");
  });
});

describe("roda dentada e corrente (#230)", () => {
  test("diâmetro primitivo = passo ÷ sen(π/z)", () => {
    const { warnings } = buildSprocket(ctx(), DEFAULT_SPROCKET);
    const pd = DEFAULT_SPROCKET.pitch / Math.sin(Math.PI / DEFAULT_SPROCKET.teeth);
    expect((warnings ?? []).join(" ")).toContain(pd.toFixed(2).replace(".", ","));
  });

  test("roda dentada é válida e de uma peça só", () => {
    const mesh = buildSprocket(ctx(), DEFAULT_SPROCKET).models[0].parts[0].mesh;
    valid(mesh);
    expect(solid(mesh).decompose()).toHaveLength(1);
  });

  test("corrente: os elos ficam soltos entre si (um corpo por elo) graças à folga", () => {
    const mesh = buildChain(ctx(), DEFAULT_CHAIN).models[0].parts[0].mesh;
    valid(mesh);
    expect(solid(mesh).decompose()).toHaveLength(DEFAULT_CHAIN.links);
  });

  test("folga curta na corrente gera aviso", () => {
    expect(buildChain(ctx(), { ...DEFAULT_CHAIN, gap: 0.1 }).warnings?.join(" ")).toContain("0,2 mm");
  });
});

describe("redutor planetário (#230)", () => {
  test("razão 1 + coroa/sol e as quatro peças são válidas", () => {
    const { models, warnings } = buildPlanetary(ctx(), DEFAULT_PLANETARY);
    expect(models.map((m) => m.name)).toEqual(["Coroa", "Sol", "Planetas", "Porta-satélites"]);
    models.flatMap((m) => m.parts).forEach((x) => valid(x.mesh));
    const ring = DEFAULT_PLANETARY.sun + 2 * DEFAULT_PLANETARY.planet;
    expect((warnings ?? []).join(" ")).toContain((1 + ring / DEFAULT_PLANETARY.sun).toFixed(2).replace(".", ","));
  });

  /** Monta as peças da bandeja na posição de trabalho e mede o que se sobrepõe (mm³). */
  function assembled(p: typeof DEFAULT_PLANETARY) {
    const { models } = buildPlanetary(ctx(), p);
    const [ring, sun, planets, carrier] = models.map((m) => m.parts.map((x) => solid(x.mesh)));
    const sb = sun[0].boundingBox();
    const dx = (sb.min[0] + sb.max[0]) / 2; // o sol foi deslocado para (dx, 0) na bandeja de impressão
    const sunHome = sun[0].translate([-dx, 0, 0]);
    const planetsHome = planets.map((q) => q.translate([-dx, -dx, 0]));
    const toSun = Math.max(...planetsHome.map((q) => q.intersect(sunHome).volume()));
    const toRing = Math.max(...planetsHome.map((q) => q.intersect(ring[0]).volume()));
    // porta-satélites virado de cabeça para baixo sobre os planetas: o eixo do sol atravessa o furo central sem tocar
    const flipped = carrier[0].translate([0, -dx, 0]).rotate([180, 0, 0]).translate([0, 0, p.thickness + 3]);
    return { count: planets.length, toSun, toRing, toShaft: flipped.intersect(sunHome).volume() };
  }

  test.each([
    ["padrão (12/12, 3 planetas)", DEFAULT_PLANETARY, 3],
    ["dentes ímpares (13/11, 3 planetas)", { ...DEFAULT_PLANETARY, sun: 13, planet: 11 }, 3],
    ["4 planetas (12/14)", { ...DEFAULT_PLANETARY, planet: 14, planets: 4 }, 4],
  ])("montado, %s: engrena no sol e na coroa sem interferência", (_n, p, count) => {
    const r = assembled(p);
    expect(r.count).toBe(count);
    expect(r.toSun).toBeLessThan(1);
    expect(r.toRing).toBeLessThan(1);
    expect(r.toShaft).toBeLessThan(1e-3);
  });

  test("dentes que não fecham com o número de planetas ajustam ou recusam", () => {
    expect(planetCount(12, 12, 5, 1.5)).not.toBe(5);
    expect(planetCount(12, 12, 4, 1.5)).toBe(4);
  });
});
