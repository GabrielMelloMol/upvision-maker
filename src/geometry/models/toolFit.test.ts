import { beforeAll, describe, expect, test } from "vitest";
import { EXAMPLE_OUTLINES } from "../../organizer/examples";
import type { ToolOutline } from "../../organizer/types";
import { bedMm } from "../bed";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import { FOOT_H, GRID } from "./gridfinity";
import { buildToolFit, DEFAULT_TOOL_FIT as D, type ToolFitParams } from "./toolFit";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const bar = (w: number, h: number): ToolOutline => ({ id: "barra", label: "Barra", points: [[10, 10], [10 + w, 10], [10 + w, 10 + h], [10, 10 + h]] });
const build = (tools: ToolOutline[], p: Partial<ToolFitParams> = {}) => buildToolFit(M, tools, { ...D, ...p });
/** Contornos do corte horizontal em z: [largura, profundidade] de cada um, do maior para o menor. */
const holesAt = (m: Mesh, z: number) => {
  const s = solid(m);
  const polys = s.slice(z).toPolygons();
  s.delete();
  return polys.map((p) => {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }).sort((a, b) => b[0] * b[1] - a[0] * a[1]);
};

describe("bloco com encaixe (#169)", { timeout: 60_000 }, () => {
  test("bolsão = ferramenta + folga dos dois lados, na profundidade pedida, com o fundo por baixo", () => {
    const out = build([bar(100, 20)], { mode: "block", clearance: 0.3, depth: 12, floor: 2, finger: false });
    const m = out.models[0].parts[0].mesh;
    const b = meshBounds([m])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(14, 3);
    const [outer, pocket] = holesAt(m, 13);
    expect(pocket[0]).toBeCloseTo(100.6, 1);
    expect(pocket[1]).toBeCloseTo(20.6, 1);
    expect(outer[0]).toBeCloseTo(100.6 + 2 * D.wall, 1);
    expect(holesAt(m, 1.5)).toHaveLength(1); // fundo inteiro
    expect(solid(m).status()).toBe("NoError");
  });

  test("folga zero: bolsão do tamanho exato; avisa para imprimir a peça de teste", () => {
    const out = build([bar(80, 15)], { mode: "block", clearance: 0, finger: false });
    expect(holesAt(out.models[0].parts[0].mesh, D.floor + 1)[1][0]).toBeCloseTo(80, 1);
    expect(out.warnings?.join()).toMatch(/teste/);
  });

  test("recorte para o dedo alarga o bolsão no meio, só de um lado", () => {
    const m = build([bar(100, 20)], { mode: "block", clearance: 0.3, finger: true }).models[0].parts[0].mesh;
    const [, pocket] = holesAt(m, D.floor + 1);
    expect(pocket[0]).toBeCloseTo(100.6, 1);
    expect(pocket[1]).toBeGreaterThan(20.6 + 5);
  });

  test("furo da ferramenta (argola da tesoura) fica como pino dentro do bolsão", () => {
    const scissors = EXAMPLE_OUTLINES.find((o) => o.id === "tesoura")!;
    const m = build([scissors], { mode: "block", finger: false }).models[0].parts[0].mesh;
    // corte do bolsão: bloco + bolsão + 2 pinos
    expect(holesAt(m, D.floor + 1)).toHaveLength(4);
  });

  test("contorno inválido dá erro claro", () => {
    expect(() => build([{ id: "x", points: [[0, 0], [1, 1]] }])).toThrow(/contorno/i);
  });
});

describe("caixa Gridfinity (#169)", { timeout: 60_000 }, () => {
  test("casas de 42 mm, altura em unidades de 7, pés com o perfil padrão e os bolsões no topo", () => {
    const out = build(EXAMPLE_OUTLINES, { mode: "gridfinity", depth: 12, floor: 2 });
    const m = out.models[0].parts[0].mesh;
    const b = meshBounds([m])!;
    const w = b.max[0] - b.min[0], d = b.max[1] - b.min[1];
    expect(((w + 0.5) / GRID) % 1).toBeCloseTo(0, 2);
    expect(((d + 0.5) / GRID) % 1).toBeCloseTo(0, 2);
    expect((b.max[2] / 7) % 1).toBeCloseTo(0, 2);
    expect(b.max[2]).toBeGreaterThanOrEqual(FOOT_H + 2 + 12 - 1e-6);
    const s = solid(m);
    expect(s.status()).toBe("NoError");
    expect(s.decompose()).toHaveLength(1);
    const foot = s.slice(0.2).bounds(), body = s.slice(FOOT_H + 0.5).bounds();
    expect(foot.max[0] - foot.min[0]).toBeLessThan(body.max[0] - body.min[0]); // pé mais estreito embaixo
    expect(holesAt(m, b.max[2] - 1).length).toBeGreaterThan(3); // casca + 3 bolsões (+ pinos)
  });
});

describe("organizador de gaveta (#169)", { timeout: 60_000 }, () => {
  test("gaveta maior que a mesa vira bandejas que cabem na mesa e juntas cabem na gaveta, com todas as ferramentas", () => {
    const tools = [...EXAMPLE_OUTLINES, ...EXAMPLE_OUTLINES.map((o) => ({ ...o, id: `${o.id}-2` }))];
    const out = build(tools, { mode: "drawer", drawerW: 400, drawerD: 300 });
    expect(out.models.length).toBeGreaterThan(1);
    let area = 0;
    for (const t of out.models) {
      const b = meshBounds(t.parts.map((p) => p.mesh))!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(bedMm());
      area += (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
    }
    expect(area).toBeLessThanOrEqual(400 * 300);
    expect(out.warnings?.join()).not.toMatch(/não coube/);
  });

  test("ferramenta que não cabe na gaveta é avisada", () => {
    const out = build([bar(300, 20)], { mode: "drawer", drawerW: 200, drawerD: 150 });
    expect(out.warnings?.join()).toMatch(/não coube/);
    expect(out.warnings?.join()).toMatch(/nenhuma ferramenta cabe/);
    expect(out.models).toEqual([]);
  });
});

describe("peça de teste (#169)", { timeout: 60_000 }, () => {
  test("só o contorno, 2 mm de altura, com a mesma folga", () => {
    const out = build([bar(100, 20)], { mode: "test", clearance: 0.6 });
    const m = out.models[0].parts[0].mesh;
    expect(meshBounds([m])!.max[2]).toBeCloseTo(2, 3);
    const [, inside] = holesAt(m, 1);
    expect(inside[0]).toBeCloseTo(101.2, 1);
    expect(inside[1]).toBeCloseTo(21.2, 1);
  });
});
