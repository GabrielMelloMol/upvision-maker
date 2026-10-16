import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { bedCut, DEFAULT_BEDCUT, type BedCutOptions } from "./bedCut";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { volume } from "./testUtil";
import type { Model } from "./types";

let M: ManifoldToplevel;
let font: opentype.Font;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync("node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
  font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
});
const block = (x: number, y: number, z: number): Model => ({ name: "Peça", parts: [{ name: "Peça", color: "#ddd", mesh: toMesh(M.Manifold.cube([x, y, z], false)) }] });
const opts = (p: Partial<BedCutOptions> = {}): BedCutOptions => ({ ...DEFAULT_BEDCUT, ...p });
const vol = (m: Model) => m.parts.reduce((s, q) => s + volume(q.mesh), 0);
const pieces = (r: ReturnType<typeof bedCut>) => r.models.filter((m) => m.name.startsWith("Peça"));

describe("cortar para caber na mesa (#218)", { timeout: 120_000 }, () => {
  test("peça que cabe: um pedaço só, sem junta", () => {
    const r = bedCut(M, block(100, 100, 50), opts(), font);
    expect(r.info).toMatchObject({ pieces: 1, joints: 0, counts: [1, 1, 1], plates: 1 });
    expect(pieces(r)).toHaveLength(1);
  });

  test("300 × 200 × 100 na mesa de 256: 2 pedaços, 1 junta com pino redondo, furo nos dois e pino solto à parte", () => {
    const r = bedCut(M, block(300, 200, 100), opts({ numbers: false }), font);
    expect(r.warnings).toEqual([]);
    expect(r.info).toMatchObject({ counts: [2, 1, 1], pieces: 2, joints: 1 });
    const [a, b] = pieces(r);
    expect(vol(a)).toBeLessThan(150 * 200 * 100); // o furo tirou volume
    expect(vol(b)).toBeLessThan(150 * 200 * 100);
    const pin = r.models.find((m) => m.name.startsWith("Chave ou pinos"))!;
    expect(vol(pin)).toBeGreaterThan(0);
    // o volume que os dois furos tiraram é maior que o do pino (folga do encaixe)
    expect(2 * 150 * 200 * 100 - vol(a) - vol(b)).toBeGreaterThan(vol(pin));
    expect(2 * 150 * 200 * 100 - vol(a) - vol(b)).toBeLessThan(vol(pin) * 1.6);
  });

  test("todo pedaço cabe na mesa e assenta nela (z mínimo 0, dentro da área útil)", () => {
    const r = bedCut(M, block(600, 300, 100), opts(), font);
    expect(r.info.counts).toEqual([3, 2, 1]);
    expect(r.info.pieces).toBe(6);
    for (const m of pieces(r)) {
      const b = meshBounds(m.parts.map((q) => q.mesh))!;
      expect(b.min[2]).toBeCloseTo(0, 3);
      expect(b.max[2]).toBeLessThanOrEqual(256 + 1e-3);
      expect(Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(248 + 1e-3);
    }
  });

  test("juntas numeradas 1..n e cada junta aparece nos dois pedaços que ela une", () => {
    const r = bedCut(M, block(600, 300, 100), opts(), font);
    expect(r.info.joints).toBe(7); // 4 juntas em X (2 planos × 2 fileiras) e 3 em Y
    const names = pieces(r).map((m) => m.name);
    for (let id = 1; id <= 7; id++) expect(names.filter((n) => new RegExp(`juntas? ([\\d, ]*\\b)?${id}\\b`).test(n.replace("juntas", "juntas "))).length).toBeGreaterThanOrEqual(2);
  });

  test("o número é gravado nas duas faces: com número a peça perde um pouco mais de volume", () => {
    const sem = bedCut(M, block(300, 200, 100), opts({ numbers: false }), font);
    const com = bedCut(M, block(300, 200, 100), opts({ numbers: true }), font);
    const v = (r: ReturnType<typeof bedCut>) => pieces(r).reduce((s, m) => s + vol(m), 0);
    expect(v(sem) - v(com)).toBeGreaterThan(1);
    expect(v(sem) - v(com)).toBeLessThan(200); // 2 faces × número de 4 mm × 0,4 mm de fundo
  });

  test("sem encaixe: só as peças, volume exato", () => {
    const r = bedCut(M, block(300, 200, 100), opts({ joint: "none", numbers: false }), font);
    expect(r.models).toHaveLength(2);
    expect(pieces(r).reduce((s, m) => s + vol(m), 0)).toBeCloseTo(300 * 200 * 100, 0);
  });

  test("ímã: furos de 6,3 mm nos dois lados e nenhuma peça solta", () => {
    const r = bedCut(M, block(300, 200, 100), opts({ joint: "magnet", numbers: false }), font);
    expect(r.models.some((m) => m.name.startsWith("Chave"))).toBe(false);
    const lost = 300 * 200 * 100 - pieces(r).reduce((s, m) => s + vol(m), 0);
    const hole = Math.PI * (6.3 / 2) ** 2 * (2 + 0.3);
    expect(lost).toBeGreaterThan(2 * hole * 0.95);
  });

  test("rabo de andorinha: ranhura nos dois pedaços e uma chave solta menor que a ranhura", () => {
    const r = bedCut(M, block(300, 200, 100), opts({ joint: "dovetail", numbers: false }), font);
    expect(r.warnings).toEqual([]);
    const key = r.models.find((m) => m.name.startsWith("Chave"))!;
    const lost = 300 * 200 * 100 - pieces(r).reduce((s, m) => s + vol(m), 0);
    expect(vol(key)).toBeGreaterThan(50);
    expect(lost).toBeGreaterThan(vol(key));
    expect(lost).toBeLessThan(vol(key) * 2);
  });

  test("corte em Y e em Z também funcionam (a peça de 100 × 100 × 600 vira 3 em pé)", () => {
    const r = bedCut(M, block(100, 100, 600), opts({ numbers: false }), font);
    expect(r.info.counts).toEqual([1, 1, 3]);
    expect(r.info.joints).toBe(2);
    const total = pieces(r).reduce((s, m) => s + vol(m), 0);
    expect(total).toBeLessThan(100 * 100 * 600);
    expect(total).toBeGreaterThan(100 * 100 * 600 - 4 * 3000);
  });

  test("contagem manual vale no lugar da automática", () => {
    const r = bedCut(M, block(300, 200, 100), opts({ counts: [3, 1, 1] }), font);
    expect(r.info).toMatchObject({ counts: [3, 1, 1], auto: false, pieces: 3, joints: 2 });
  });

  test("montada: um modelo de prévia por pedaço e o afastamento abre espaço entre eles", () => {
    const junto = bedCut(M, block(300, 200, 100), opts({ explode: 0 }), font);
    const aberto = bedCut(M, block(300, 200, 100), opts({ explode: 30 }), font);
    const w = (r: ReturnType<typeof bedCut>) => { const b = meshBounds(r.assembled.flatMap((m) => m.parts.map((p) => p.mesh)))!; return b.max[0] - b.min[0]; };
    expect(junto.assembled).toHaveLength(2);
    expect(w(aberto) - w(junto)).toBeCloseTo(30, 0);
  });

  test("mesas: peças que não cabem juntas vão para a mesa seguinte", () => {
    const r = bedCut(M, block(900, 500, 200), opts({ numbers: false }), font);
    expect(r.info.plates).toBeGreaterThan(1);
  });

  test("peça com furo na malha de verdade (pé de mesa em L) corta e soma o volume", () => {
    const l = M.Manifold.cube([300, 60, 60], false).add(M.Manifold.cube([60, 220, 60], false));
    const model: Model = { name: "L", parts: [{ name: "L", color: "#ddd", mesh: toMesh(l) }] };
    const r = bedCut(M, model, opts({ joint: "none", numbers: false }), font);
    expect(pieces(r).reduce((s, m) => s + vol(m), 0)).toBeCloseTo(l.volume(), 0);
  });
});

describe("cortar no vão entre partes soltas (#218)", { timeout: 120_000 }, () => {
  test("duas peças soltas: o corte cai no vão, não conta junta nem faz pino", () => {
    const two = M.Manifold.cube([100, 50, 30], false).add(M.Manifold.cube([100, 50, 30], false).translate([300, 0, 0]));
    const r = bedCut(M, { name: "Duas", parts: [{ name: "Duas", color: "#ddd", mesh: toMesh(two) }] }, opts(), font);
    expect(r.info).toMatchObject({ pieces: 2, joints: 0 });
    expect(r.models.some((m) => m.name.startsWith("Chave"))).toBe(false);
    expect(pieces(r).reduce((s, m) => s + vol(m), 0)).toBeCloseTo(two.volume(), 0);
  });
});
