import { describe, expect, test } from "vitest";
import { printPlan } from "./printPlan";
import type { Mesh, Model } from "./types";

/** Caixa de z0 a z1 (só as posições importam para o plano). */
const box = (z0: number, z1: number, x = 0): Mesh => ({
  positions: new Float32Array([x, 0, z0, x + 1, 0, z0, x, 1, z1, x + 1, 1, z1]),
  indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
});
const model = (parts: [string, number, number, number?][]): Model => ({ name: "M", parts: parts.map(([color, z0, z1, x], i) => ({ name: `P${i}`, color, mesh: box(z0, z1, x) })) });

describe("como vai imprimir", () => {
  test("AMS: não mexe em nada", () => {
    const m = [model([["#000000", 0, 2], ["#ffffff", 2, 3]])];
    expect(printPlan(m, "ams", 0.2)).toEqual({ models: m, pauses: [], swaps: [], error: null });
  });

  test("1 cor: todas as partes com a cor da primeira, sem pausas", () => {
    const r = printPlan([model([["#000000", 0, 2], ["#ffffff", 2, 3]])], "single", 0.2);
    expect(r.models[0].parts.map((p) => p.color)).toEqual(["#000000", "#000000"]);
    expect(r.pauses).toEqual([]);
  });

  test("troca manual: cores empilhadas viram pausas na 1ª camada de cada cor, arquivo em 1 filamento", () => {
    const r = printPlan([model([["#000000", 0, 2], ["#ffffff", 2, 3], ["#ff0000", 3, 3.6]])], "manual", 0.2);
    expect(r.error).toBeNull();
    expect(r.pauses).toEqual([2.2, 3.2]); // pausa antes da camada de topo 2,2 (a 1ª do branco) e 3,2
    expect(r.swaps.map((s) => s.color)).toEqual(["#ffffff", "#ff0000"]);
    expect(new Set(r.models[0].parts.map((p) => p.color))).toEqual(new Set(["#000000"]));
  });

  test("troca manual: mesma cor em alturas diferentes e várias peças na mesa contam uma vez", () => {
    const r = printPlan([model([["#000000", 0, 2], ["#ffffff", 2, 3]]), model([["#000000", 0, 2, 50], ["#ffffff", 2, 2.6, 50]])], "manual", 0.2);
    expect(r.pauses).toEqual([2.2]);
  });

  test("troca manual impossível: duas cores na mesma altura (lado a lado)", () => {
    const r = printPlan([model([["#000000", 0, 2], ["#ffffff", 0, 2, 10]])], "manual", 0.2);
    expect(r.error).toMatch(/lado a lado/);
    expect(r.pauses).toEqual([]);
  });

  test("troca manual: pausas do próprio modelo (ex.: tag NFC) continuam", () => {
    const r = printPlan([model([["#000000", 0, 3], ["#ffffff", 3, 3.8]])], "manual", 0.2, [2]);
    expect(r.pauses).toEqual([2, 3.2]);
  });
});
