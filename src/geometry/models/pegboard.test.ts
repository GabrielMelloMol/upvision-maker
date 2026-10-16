import { beforeAll, describe, expect, test } from "vitest";
import { setBed } from "../bed";
import { modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildPegboard, buildPegHooks, DEFAULT_PEG_HOOKS, DEFAULT_PEGBOARD, gridOf, screwCells, tileMax, type PegboardParams, type PegHooksParams } from "./pegboard";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  ctx = { M, art: null, artLayers: null, text: () => null };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const board = (over: Partial<PegboardParams> = {}) => buildPegboard(ctx, { ...DEFAULT_PEGBOARD, ...over });
const hooks = (over: Partial<PegHooksParams> = {}) => buildPegHooks(ctx, { ...DEFAULT_PEG_HOOKS, ...over });

describe("painel perfurado (#214)", { timeout: 60_000 }, () => {
  test("o tamanho vira colunas e linhas inteiras de furos e a peça tem essa medida", () => {
    expect(gridOf({ width: 250, height: 200, pitch: 25 })).toEqual({ cols: 10, rows: 8 });
    const out = board();
    expect(out.models).toHaveLength(1);
    const b = modelsBounds(out.models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(250, 2);
    expect(b.max[1] - b.min[1]).toBeCloseTo(200, 2);
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(5 + 12, 2); // painel + espaçadores atrás
  });

  test("furos redondos no diâmetro pedido, em grade, sem furo nos cantos dos parafusos (esses levam rebaixo)", () => {
    const s = solid(board().models[0].parts[0].mesh);
    expect(s.status()).toBe("NoError");
    expect(s.decompose()).toHaveLength(1);
    const slice = s.slice(2.5); // meio da espessura: só os furos e os parafusos
    const holes = slice.decompose();
    const cells = 10 * 8;
    const screws = screwCells(10, 8).length;
    // cada furo de grade e cada furo de parafuso é um vazio dentro do painel
    const area = 250 * 200 - slice.area();
    const expected = (cells - screws) * Math.PI * 3 ** 2 + screws * Math.PI * 2.25 ** 2;
    expect(area).toBeCloseTo(expected, -1);
    expect(holes.length).toBeGreaterThan(0);
    s.delete();
  });

  test("parafusos nos 4 cantos com rebaixo na frente e espaçador atrás; borda comprida ganha um no meio", () => {
    expect(screwCells(10, 8)).toHaveLength(4 + 2); // 4 cantos + 1 no meio de cima e 1 no de baixo (passa de 8 colunas)
    expect(screwCells(20, 20)).toHaveLength(4 + 2 * 2 + 2 * 2); // 2 no meio de cada borda
    expect(screwCells(4, 4)).toHaveLength(4);
    const s = solid(board({ width: 100, height: 100 }).models[0].parts[0].mesh);
    // rebaixo: a 0,3 mm da frente, o furo do canto é largo (Ø9); no meio da espessura, estreito (Ø4,5)
    const front = s.slice(0.3);
    const mid = s.slice(2.5);
    expect(front.area()).toBeLessThan(mid.area()); // o rebaixo tira mais material na frente
    // espaçador: no alto (z = 10) só sobram os 4 anéis
    expect(s.slice(10).decompose()).toHaveLength(4);
    s.delete();
  });

  test("sem espaçador (standoff 0) a peça tem só a espessura do painel", () => {
    const b = modelsBounds(board({ standoff: 0 }).models)!;
    expect(b.max[2]).toBeCloseTo(5, 3);
  });

  test("painel maior que a mesa sai em ladrilhos cortados entre os furos, todos cabendo na mesa", () => {
    setBed({ x: 256, y: 256, z: 256 });
    const out = board({ width: 600, height: 300 });
    const { cols, rows } = gridOf({ width: 600, height: 300, pitch: 25 });
    expect(cols * rows).toBe(24 * 12);
    expect(out.models.length).toBeGreaterThan(1);
    expect(out.warnings?.some((w) => /ladrilhos/.test(w))).toBe(true);
    let total = 0;
    for (const m of out.models) {
      const b = modelsBounds([m])!;
      expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
      expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(256);
      // as bordas dos ladrilhos caem entre os furos: largura e altura são múltiplos do passo
      expect(Math.abs(((b.max[0] - b.min[0]) / 25) % 1) < 1e-6 || Math.abs(((b.max[0] - b.min[0]) / 25) % 1) > 1 - 1e-6).toBe(true);
      total += (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
    }
    expect(total).toBeCloseTo(600 * 300, 0);
    expect(tileMax(25)).toBe(10);
  });

  test("passo de 20 mm com furo menor também funciona", () => {
    const out = board({ pitch: 20, hole: 5, width: 200, height: 160 });
    const b = modelsBounds(out.models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(200, 2);
  });
});

describe("ganchos para o painel perfurado (#214)", { timeout: 60_000 }, () => {
  test.each(["j", "double", "rod"] as const)("gancho %s: peça fechada e na mesa", (kind) => {
    const out = hooks({ kind, count: 1 });
    const s = solid(out.models[0].parts[0].mesh);
    expect(s.status()).toBe("NoError");
    expect(s.decompose()).toHaveLength(1);
    expect(s.boundingBox().min[2]).toBeCloseTo(0, 6);
    s.delete();
  });

  test("o pino entra no furo do painel (0,4 mm de folga) e atravessa com 5 mm sobrando do outro lado", () => {
    const panel = solid(board({ width: 100, height: 100, standoff: 0, screws: false }).models[0].parts[0].mesh);
    const hook = solid(hooks({ count: 1 }).models[0].parts[0].mesh);
    const hb = hook.boundingBox();
    const pegLen = 5 + 5;
    // gancho em pé: o eixo do pino (x do gancho) vira o eixo do furo (z); a cabeça encosta na frente do painel
    const r = 2.8;
    const axisY = 4.5; // o gancho sai da mesa com o mínimo em y = 0 e o eixo do pino a meia largura da cabeça
    const placed = hook.rotate([0, -90, 0]).translate([37.5 + r, 37.5 - axisY, 5 - pegLen + (0 - hb.min[0])]);
    expect(placed.intersect(panel).volume()).toBeCloseTo(0, 3); // o pino não bate no furo de 6 mm
    expect(placed.boundingBox().min[2]).toBeCloseTo(5 - pegLen, 1); // sobra do outro lado
    panel.delete();
    hook.delete();
    placed.delete();
  });

  test("mais ganchos do que cabem na mesa avisam quantas vezes imprimir", () => {
    setBed({ x: 256, y: 256, z: 256 });
    const out = hooks({ count: 24, length: 120, lip: 40 });
    expect(out.warnings?.some((w) => /por mesa/.test(w))).toBe(true);
    expect(hooks({ count: 6 }).warnings).toEqual([]);
  });

  test("o gancho duplo tem dois pinos separados por um passo", () => {
    const s = solid(hooks({ kind: "double", count: 1 }).models[0].parts[0].mesh);
    const b = s.boundingBox();
    expect(b.max[1] - b.min[1]).toBeGreaterThan(25);
    s.delete();
  });

  test("várias cópias entram na mesa em fileiras, sem se tocar, como uma peça só", () => {
    setBed({ x: 256, y: 256, z: 256 });
    const one = modelsBounds(hooks({ count: 1 }).models)!;
    const out = hooks({ count: 12 });
    const b = modelsBounds(out.models)!;
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(256);
    const s = solid(out.models[0].parts[0].mesh);
    expect(s.decompose()).toHaveLength(12);
    expect(b.max[0] - b.min[0]).toBeGreaterThanOrEqual(one.max[0] - one.min[0]);
    s.delete();
  });
});
