import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EXAMPLE_OUTLINES } from "../../organizer/examples";
import type { ToolOutline } from "../../organizer/types";
import { bedMm, setBed } from "../bed";
import { read3mf } from "../threemfRead";
import { write3mf } from "../threemf";
import { BED_MARGIN } from "./gridDrawer";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh } from "../types";
import { FOOT_H, GRID } from "./gridfinity";
import { buildToolFit, DEFAULT_TOOL_FIT as D, suggestedDepth, type ToolFitParams } from "./toolFit";

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

  test("furo pequeno (lado menor até 5 mm) não vira pino; furo maior vira (#169, óculos)", () => {
    const sq = (cx: number, side: number): [number, number][] => [[cx - side / 2, 25 - side / 2], [cx + side / 2, 25 - side / 2], [cx + side / 2, 25 + side / 2], [cx - side / 2, 25 + side / 2]];
    const slot = (cx: number): [number, number][] => [[cx - 15, 23], [cx + 15, 23], [cx + 15, 27], [cx - 15, 27]]; // 30 × 4: comprido mas fino
    const tool: ToolOutline = { id: "f", points: [[0, 10], [120, 10], [120, 40], [0, 40]], holes: [sq(15, 4), sq(40, 8), slot(80)] };
    const m = build([tool], { mode: "block", finger: false, clearance: 0 }).models[0].parts[0].mesh;
    expect(holesAt(m, D.floor + 1)).toHaveLength(3); // bloco + bolsão + 1 pino (só o de 8 mm)
  });

  test("altura total acompanha a profundidade (fundo + profundidade)", () => {
    for (const depth of [12, 24]) {
      const b = meshBounds(build([bar(60, 20)], { mode: "block", depth, floor: 2 }).models[0].parts.map((q) => q.mesh))!;
      expect(b.max[2]).toBeCloseTo(2 + depth, 3);
    }
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

  test("bandeja do tamanho das ferramentas, não da mesa: 1 ferramenta pequena gasta menos de 25% de uma bandeja cheia (#169, óculos)", () => {
    const p = { mode: "drawer" as const, drawerW: 400, drawerD: 300, clearance: 0.6, depth: 12, floor: 2 };
    const out = build([bar(140, 50)], p);
    expect(out.models).toHaveLength(1);
    const tray = out.models[0].parts[0].mesh;
    const b = meshBounds([tray])!;
    const need = (n: number) => n + 2 * (0.6 + D.wall);
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(Math.ceil(need(140) / 5) * 5 + 1e-6); // arredondada em 5 mm
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(Math.ceil((need(50) + 11) / 5) * 5 + 1e-6); // + espaço do dedo
    const full = (bedMm() - 2 * BED_MARGIN) ** 2 * 14; // bandeja maciça do tamanho da mesa
    expect(volume(tray)).toBeLessThan(0.25 * full);
    expect(out.warnings?.join()).toMatch(/Bandeja de \d+ × \d+ mm/);
  });

  test("ferramentas que precisam: a bandeja cresce até a mesa e reparte em mais bandejas", () => {
    const out = build([...EXAMPLE_OUTLINES, ...EXAMPLE_OUTLINES.map((o) => ({ ...o, id: `${o.id}-2` }))], { mode: "drawer", drawerW: 600, drawerD: 500 });
    for (const t of out.models) {
      const b = meshBounds(t.parts.map((q) => q.mesh))!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(bedMm() - 2 * BED_MARGIN + 1e-6);
    }
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

describe("todas as saídas dentro da mesa (#169: gaveta e teste saíam no canto)", { timeout: 60_000 }, () => {
  afterEach(() => setBed(null));
  const OUTPUTS: [string, Partial<ToolFitParams>][] = [
    ["bloco", { mode: "block" }],
    ["Gridfinity", { mode: "gridfinity" }],
    ["gaveta de uma bandeja", { mode: "drawer", drawerW: 260, drawerD: 260 }],
    ["peça de teste", { mode: "test" }],
  ];
  for (const bed of [{ x: 256, y: 256, z: 256 }, { x: 350, y: 320, z: 325 }])
    for (const [name, p] of OUTPUTS)
      test(`${name} na mesa ${bed.x} × ${bed.y}: prévia centrada e 3MF dentro da mesa, com margem`, () => {
        setBed(bed);
        const half = bedMm() / 2 - BED_MARGIN + 1e-6;
        const out = build(EXAMPLE_OUTLINES, { ...p, clearance: 0.6, finger: true });
        expect(out.models.length).toBeGreaterThan(0);
        // prévia: a grade da mesa é centrada na origem
        const b = meshBounds(out.models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
        for (const v of [b.min[0], b.min[1], b.max[0], b.max[1]]) expect(Math.abs(v)).toBeLessThanOrEqual(half);
        expect(Math.abs((b.min[0] + b.max[0]) / 2)).toBeLessThan(0.5);
        expect(Math.abs((b.min[1] + b.max[1]) / 2)).toBeLessThan(0.5);
        // 3MF: o fatiador põe a origem no canto da mesa
        const f = meshBounds(read3mf(write3mf(out.models)).objects.flatMap((o) => o.parts.map((q) => q.mesh)))!;
        expect(f.min[0]).toBeGreaterThanOrEqual(BED_MARGIN - 1e-6);
        expect(f.min[1]).toBeGreaterThanOrEqual(BED_MARGIN - 1e-6);
        expect(f.max[0]).toBeLessThanOrEqual(bed.x - BED_MARGIN + 1e-6);
        expect(f.max[1]).toBeLessThanOrEqual(bed.y - BED_MARGIN + 1e-6);
        expect(f.min[2]).toBeCloseTo(0, 3);
      });

  test("gaveta grande: cada bandeja cabe na mesa menos a margem; o conjunto sai centrado", () => {
    const out = build([...EXAMPLE_OUTLINES, ...EXAMPLE_OUTLINES.map((o) => ({ ...o, id: `${o.id}-2` }))], { mode: "drawer", drawerW: 450, drawerD: 320 });
    expect(out.models.length).toBeGreaterThan(1);
    for (const t of out.models) {
      const b = meshBounds(t.parts.map((q) => q.mesh))!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(bedMm() - 2 * BED_MARGIN + 1e-6);
    }
    const all = meshBounds(out.models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
    expect(Math.abs((all.min[0] + all.max[0]) / 2)).toBeLessThan(0.5);
    expect(Math.abs((all.min[1] + all.max[1]) / 2)).toBeLessThan(0.5);
  });
});

describe("profundidade sugerida pela altura (#169)", () => {
  test("altura × 0,6, arredondada em mm, nos limites da tela; sem altura não sugere", () => {
    expect(suggestedDepth([{ id: "a", points: [], heightMm: 40 }])).toBe(24); // óculos dobrados
    expect(suggestedDepth([{ id: "a", points: [], heightMm: 15 }, { id: "b", points: [], heightMm: 26 }])).toBe(16); // a mais alta manda
    expect(suggestedDepth([{ id: "a", points: [], heightMm: 2 }])).toBe(3);
    expect(suggestedDepth([{ id: "a", points: [], heightMm: 200 }])).toBe(60);
    expect(suggestedDepth([{ id: "a", points: [] }])).toBeNull();
    expect(suggestedDepth([{ id: "a", points: [], heightMm: 0 }])).toBeNull();
  });
});
