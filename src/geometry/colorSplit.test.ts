import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { splitByColor } from "./colorSplit";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { volume } from "./testUtil";
import { read3mf } from "./threemfRead";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const fixture = (n: string) => read3mf(new Uint8Array(readFileSync(resolve(__dirname, "../../tests/fixtures/3mf", n))));

describe("separar 3MF por cor", () => {
  test("cubo pintado (projeto do Bambu): topo vira 1 mm do filamento 2, pedacinho da frente no 3, resto no 1; volumes somam o cubo", () => {
    const { models, colors, warnings } = splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 1, mode: "parts" });
    expect(warnings).toEqual([]);
    expect(models).toHaveLength(1);
    expect(colors.map((c) => c.filament)).toEqual([1, 2, 3]);
    const byF = Object.fromEntries(colors.map((c) => [c.filament, c.volume]));
    expect(byF[2]).toBeCloseTo(20 * 20 * 1, 0); // tampa de 1 mm
    expect(byF[3]).toBeGreaterThan(40);
    expect(byF[3]).toBeLessThan(51); // 1/4 da face da frente (50 mm²) × 1 mm, menos o canto que já é do topo
    expect(byF[1] + byF[2] + byF[3]).toBeCloseTo(8000, 0);
    const top = meshBounds([models[0].parts.find((p) => p.name.endsWith("filamento 2"))!.mesh])!;
    expect([top.min[2], top.max[2]]).toEqual([expect.closeTo(19), expect.closeTo(20)]);
    for (const p of models[0].parts) expect(volume(p.mesh)).toBeGreaterThan(0);
  });

  test("objetos separados: um objeto por cor, lado a lado e apoiados na mesa", () => {
    const { models } = splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 1, mode: "objects" });
    expect(models).toHaveLength(3);
    const boxes = models.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    for (const b of boxes) expect(b.min[2]).toBeCloseTo(0);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].min[0]).toBeGreaterThan(boxes[i - 1].max[0]);
  });

  test("profundidade menor que a linha do bico com cor nas laterais: avisa que ela some (#90)", () => {
    const thin = splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 0.2, mode: "parts" });
    expect(thin.warnings.join()).toMatch(/some no fatiador/);
    expect(splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 0.4, mode: "parts" }).warnings).toEqual([]);
  });

  test("profundidade maior = volume de cor maior", () => {
    const thin = splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 0.6, mode: "parts" }).colors.find((c) => c.filament === 2)!.volume;
    const thick = splitByColor(M, fixture("cubo-pintado-bambu.3mf"), { depth: 2, mode: "parts" }).colors.find((c) => c.filament === 2)!.volume;
    expect(thick).toBeGreaterThan(thin * 3);
  });

  test("peça em 2 partes (sem pintura): cada parte com sua cor; só uma cor dá aviso", () => {
    const r = splitByColor(M, fixture("chaveiro-2-partes-bambu.3mf"), { depth: 1, mode: "parts" });
    expect(r.colors.map((c) => c.filament)).toEqual([1, 2]);
    const one = fixture("cubo-pintado-bambu.3mf");
    one.objects[0].parts[0].paint = null;
    expect(splitByColor(M, one, { depth: 1, mode: "parts" }).warnings.join()).toMatch(/Só uma cor/);
  });

  test("malha aberta (não-manifold): recusa com mensagem clara", () => {
    const f = fixture("cubo-pintado-bambu.3mf");
    const part = f.objects[0].parts[0];
    part.mesh = { positions: part.mesh.positions, indices: part.mesh.indices.slice(3) }; // tira um triângulo: buraco
    expect(() => splitByColor(M, f, { depth: 1, mode: "parts" })).toThrow(/malha aberta ou com erros/);
  });
});
