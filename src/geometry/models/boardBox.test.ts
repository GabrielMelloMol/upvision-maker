import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildBoardBox, DEFAULT_BOARD_BOX, parseConnectors, parseHoles, type BoardBoxParams } from "./boardBox";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const box = (p: Partial<BoardBoxParams> = {}) => buildBoardBox(ctx(), { ...DEFAULT_BOARD_BOX, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (o: ReturnType<typeof box>, name: string) => o.models.find((m) => m.name === name)?.parts[0];
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };
const P = DEFAULT_BOARD_BOX;
const FLOOR = 2;
const OFF = P.clearance + P.wall; // a placa começa aqui na caixa já no canto (0, 0)

/** A placa (retângulo com os furos) onde ela fica na caixa: apoiada nas colunas. */
function board(p: BoardBoxParams): Solid {
  const { holes } = parseHoles(p.holes);
  let b = M.Manifold.cube([p.boardL, p.boardW, p.boardT]);
  for (const [x, y] of holes) {
    const cut = M.Manifold.cylinder(p.boardT + 2, p.holeD / 2, p.holeD / 2, 32).translate([x, y, -1]);
    const nb = b.subtract(cut);
    b.delete();
    cut.delete();
    b = nb;
  }
  const out = b.translate([OFF, OFF, FLOOR + p.standoffH]);
  b.delete();
  return out;
}

describe("leitura dos campos de furos e aberturas (#233)", () => {
  test("furos: ponto nos decimais; vírgula ou espaço entre x e y; ponto e vírgula ou linha entre furos; o que não é número volta como erro", () => {
    expect(parseHoles("14, 2.5; 15.3 50.7\n66.1, 7.6")).toEqual({ holes: [[14, 2.5], [15.3, 50.7], [66.1, 7.6]], bad: [] });
    expect(parseHoles("3, x; -2, 4; 5")).toEqual({ holes: [], bad: ["3, x", "-2, 4", "5"] });
    expect(parseHoles("")).toEqual({ holes: [], bad: [] });
  });

  test("aberturas: lados em português ou inglês; altura do fundo é opcional; linha incompleta volta como erro", () => {
    const { list, bad } = parseConnectors("esquerda, 38, 13, 12, 0\nright, 10.5, 8, 4, 1.5\nlixo\ntop, 3, 0, 4");
    expect(list).toEqual([{ side: "left", pos: 38, w: 13, h: 12, z0: 0 }, { side: "right", pos: 10.5, w: 8, h: 4, z0: 1.5 }]);
    expect(bad).toEqual(["lixo", "top, 3, 0, 4"]);
    expect(parseConnectors("baixo, 26, 8, 4").list).toEqual([{ side: "bottom", pos: 26, w: 8, h: 4, z0: 0 }]);
  });
});

describe("caixa para placa: a placa cabe, os pinos passam pelos furos e os conectores saem (#233)", { timeout: 60_000 }, () => {
  test("a placa (com os furos) assenta nas colunas sem encostar na caixa; uma placa maior bate na parede", () => {
    const b = solid(part(box(), "Caixa")!.mesh);
    const bd = board(P);
    expect(b.intersect(bd).volume()).toBeLessThan(0.01);
    const big = M.Manifold.cube([P.boardL + 2 * P.clearance + 0.6, P.boardW, P.boardT]).translate([OFF - P.clearance - 0.3, OFF, FLOOR + P.standoffH]);
    expect(b.intersect(big).volume()).toBeGreaterThan(1);
    [b, bd, big].forEach((o) => o.delete());
  });

  test("os pinos entram nos furos da placa (pino menor que o furo) e as colunas seguram a placa por baixo", () => {
    const b = solid(part(box(), "Caixa")!.mesh);
    const [hx, hy] = [14, 2.5];
    const probe = (x: number, z: number, size = 0.4) => M.Manifold.cube([size, size, size], true).translate([OFF + x, OFF + hy, z]);
    const mid = FLOOR + P.standoffH + P.boardT / 2;
    const checks = [
      [b.intersect(probe(hx, mid)).volume(), (v: number) => v > 0.05], // o pino está dentro do furo
      [b.intersect(probe(hx + 1.57, mid, 0.06)).volume(), (v: number) => v < 1e-6], // a borda do furo está livre
      [b.intersect(probe(hx + 2.5, FLOOR + P.standoffH - 0.5)).volume(), (v: number) => v > 0.05], // a coluna segura por baixo
    ] as const;
    checks.forEach(([v, ok], i) => expect(ok(v), `verificação ${i}`).toBe(true));
    b.delete();
  });

  test("as aberturas dos conectores atravessam a parede na posição certa e o resto da parede é maciço", () => {
    const b = solid(part(box(), "Caixa")!.mesh);
    const zUsb = FLOOR + P.standoffH + P.boardT + 6;
    const probe = (y: number, z: number) => M.Manifold.cube([1, 1, 1], true).translate([P.wall / 2, OFF + y, z]);
    expect(b.intersect(probe(38, zUsb)).volume()).toBeLessThan(0.001);
    expect(b.intersect(probe(7.5, zUsb)).volume()).toBeLessThan(0.001);
    expect(b.intersect(probe(24, zUsb)).volume()).toBeGreaterThan(0.9);
    expect(b.intersect(probe(38, FLOOR + P.standoffH + P.boardT + 14)).volume()).toBeGreaterThan(0.9);
    b.delete();
  });

  test("a tampa tem o lábio menor que o vão da caixa (folga da tampa dos dois lados) e sai ao lado, na mesa", () => {
    const out = box();
    const lid = solid(part(out, "Tampa")!.mesh);
    const lipSlice = lid.slice(2.5 + 1.2);
    const lb = lipSlice.bounds();
    const innerL = P.boardL + 2 * P.clearance;
    expect(lb.max[0] - lb.min[0]).toBeCloseTo(innerL - 2 * P.lidGap, 1);
    const cavity = meshBounds([part(out, "Caixa")!.mesh])!;
    const lidB = meshBounds([part(out, "Tampa")!.mesh])!;
    expect(lidB.min[0] > cavity.max[0] || lidB.min[1] > cavity.max[1]).toBe(true); // ao lado ou atrás, sem sobrepor
    expect(lidB.min[2]).toBeCloseTo(0, 3);
    [lid, lipSlice].forEach((o) => o.delete());
  });

  test("respiros e nome gravado tiram material da tampa; sem eles a tampa é maciça", () => {
    const solidLid = vol(part(box({ vents: 0, label: "" }), "Tampa")!.mesh);
    expect(vol(part(box({ vents: 4, label: "" }), "Tampa")!.mesh)).toBeLessThan(solidLid - 50);
    expect(vol(part(box({ vents: 0, label: "Uno" }), "Tampa")!.mesh)).toBeLessThan(solidLid - 1);
  });

  test("só a bandeja de teste: fundo, colunas e parede baixa, sem tampa e sem aberturas", () => {
    const out = box({ print: "test" });
    expect(out.models.map((m) => m.name)).toEqual(["Caixa"]);
    const b = meshBounds([part(out, "Caixa")!.mesh])!;
    expect(b.max[2]).toBeLessThan(9);
    expect(vol(part(out, "Caixa")!.mesh)).toBeLessThan(vol(part(box(), "Caixa")!.mesh));
  });

  test("montagem com parafuso: furo-piloto na coluna; sem furos de fixação (apoios nos cantos); coluna baixa avisa", () => {
    const pegs = vol(part(box({ mount: "pegs" }), "Caixa")!.mesh);
    const screws = vol(part(box({ mount: "screws" }), "Caixa")!.mesh);
    expect(screws).toBeLessThan(pegs);
    const b = solid(part(box({ mount: "pads", holes: "" }), "Caixa")!.mesh);
    const corner = M.Manifold.cube([0.4, 0.4, 0.4], true).translate([OFF + 4, OFF + 4, FLOOR + P.standoffH / 2]);
    expect(b.intersect(corner).volume()).toBeGreaterThan(0.05);
    [b, corner].forEach((o) => o.delete());
    expect(box({ standoffH: 2 }).warnings?.join(" ")).toMatch(/Coluna baixa/);
  });

  test("furo fora da placa não vira coluna solta no ar", () => {
    const out = box({ boardL: 20, boardW: 20, connectors: "", vents: 0 });
    const b = solid(part(out, "Caixa")!.mesh);
    expect(b.decompose().length).toBe(1);
    b.delete();
  });

  test("a tampa vai ao lado ou atrás da caixa, o que ocupar menos da mesa (placa larga: atrás)", () => {
    const wide = box({ boardL: 150, boardW: 40, holes: "", mount: "pads", connectors: "", vents: 0 });
    const cb = meshBounds([part(wide, "Caixa")!.mesh])!, lb = meshBounds([part(wide, "Tampa")!.mesh])!;
    expect(lb.min[1]).toBeGreaterThan(cb.max[1]); // atrás
    expect(wide.warnings!.join(" ")).not.toMatch(/passam da mesa/);
  });

  test("avisos: linhas ruins, furo fora da placa, abertura que sai da parede ou passa da altura, caixa maior que a mesa", () => {
    const w = box({ holes: "14, 2.5; lixo; 90, 10", connectors: "left, 38, 13, 12, 0\nxx" }).warnings!.join(" ");
    expect(w).toMatch(/Furo ignorado/);
    expect(w).toMatch(/Abertura ignorada/);
    expect(w).toMatch(/furo fora da placa/);
    expect(box({ connectors: "top, 3, 40, 12, 0" }).warnings!.join(" ")).toMatch(/sai da parede/);
    expect(box({ connectors: "left, 20, 6, 30, 0" }).warnings!.join(" ")).toMatch(/passa da altura/);
    expect(box({ boardL: 140, boardW: 140 }).warnings!.join(" ")).toMatch(/passam da mesa/);
    expect(box().warnings).toEqual([]);
  });
});
