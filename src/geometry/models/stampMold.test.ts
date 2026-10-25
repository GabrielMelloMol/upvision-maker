import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildStampMold, DEFAULT_STAMP_MOLD as SM } from "./stampMold";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const square = (): ModelCtx => ({ M, art: M.CrossSection.square([20, 20], true), text: () => null }); // vira 40 × 40
const CLAY = { ...SM, kind: "clay" as const, size: 40, border: 5, bridge: 0, draft: 0, cavity: 4, clayRelief: 1.5, wall: 2, thumb: false };
const FLOOR = 1.6;
// área da base (quadrado 40 + borda 5 arredondada) e do desenho
const slabArea = 40 * 40 + 4 * 40 * 5 + Math.PI * 25;

describe("forma para massinha de EVA (#252)", { timeout: 30_000 }, () => {
  test("cavidade: base do carimbo (desenho + borda) e o desenho mais fundo; forma e costas fechadas e na mesa", () => {
    const out = buildStampMold(square(), CLAY);
    expect(out.models.map((m) => m.name)).toEqual(["Forma", "Costas"]);
    const [mold, back] = out.models.map((m) => solid(m.parts[0].mesh));
    for (const s of [mold, back]) expect(s.status()).toBe("NoError");
    const mb = meshBounds([out.models[0].parts[0].mesh])!;
    expect(mb.min[2]).toBeCloseTo(0, 5);
    expect(mb.max[2]).toBeCloseTo(FLOOR + CLAY.cavity, 3);
    expect(mb.max[0] - mb.min[0]).toBeCloseTo(40 + 2 * (CLAY.border + CLAY.wall), 0);
    const outer = (40 + 2 * (CLAY.border + CLAY.wall)) ** 2 - (4 - Math.PI) * (CLAY.border + CLAY.wall) ** 2;
    const hole = slabArea * (CLAY.cavity - CLAY.clayRelief) + 1600 * CLAY.clayRelief;
    expect(mold.volume() / (outer * (FLOOR + CLAY.cavity) - hole)).toBeCloseTo(1, 1);
    expect(back.volume()).toBeCloseTo(slabArea * 3, -1); // costas do tamanho do carimbo, 3 mm
    expect(out.warnings!.join(" ")).toMatch(/1 a 2 dias/);
  });

  test("inverter: o fundo da base fica mais fundo e o desenho raso (carimba o espaço em volta)", () => {
    const normal = solid(buildStampMold(square(), CLAY).models[0].parts[0].mesh);
    const inv = solid(buildStampMold(square(), { ...CLAY, invert: true }).models[0].parts[0].mesh);
    // a diferença é a região funda: desenho (1600) contra borda (slab − 1600), na altura do desenho
    expect(normal.volume() - inv.volume()).toBeCloseTo((slabArea - 2 * 1600) * CLAY.clayRelief, -1);
  });

  test("ângulo de saída: a cavidade abre para cima (mais larga na boca) e a parede acompanha", () => {
    const flat = solid(buildStampMold(square(), CLAY).models[0].parts[0].mesh);
    const out = buildStampMold(square(), { ...CLAY, draft: 3 });
    const drafted = solid(out.models[0].parts[0].mesh);
    expect(drafted.status()).toBe("NoError");
    const width = (s: Solid, z: number) => {
      const b = s.slice(z).bounds(); // a seção é a parede: o furo de dentro mede a cavidade
      return b.max[0] - b.min[0];
    };
    const grow = CLAY.cavity * Math.tan((3 * Math.PI) / 180);
    expect(width(drafted, FLOOR + CLAY.cavity - 0.05) - width(flat, FLOOR + CLAY.cavity - 0.05)).toBeCloseTo(2 * grow, 1);
    const inner = (z: number) => drafted.slice(z).area();
    expect(inner(FLOOR + 3.9)).toBeLessThan(inner(FLOOR + 1.6)); // mais vazio em cima: sai do molde sem prender
  });

  test("apoio de polegar nas costas: em pé, sem nada no ar, e mais alto que as costas", () => {
    const out = buildStampMold(square(), { ...CLAY, thumb: true, thumbX: 100, thumbY: 0 }); // fora: o app traz para dentro
    const back = out.models[1].parts[0].mesh;
    const s = solid(back);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    const b = meshBounds([back])!;
    expect(b.max[2]).toBeGreaterThan(3 + 10);
    expect(meshBounds([out.models[0].parts[0].mesh])!.max[0]).toBeLessThan(b.min[0]); // costas ao lado da forma
  });

  test("a placa para prensar continua sendo o padrão", () => {
    expect(buildStampMold(square(), { ...SM, thumb: false }).models.map((m) => m.name)).toEqual(["Molde"]);
  });
});
