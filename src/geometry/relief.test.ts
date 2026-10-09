import { describe, expect, it } from "vitest";
import { signedVolume } from "./heightfield";
import { buildRelief, DEFAULT_RELIEF, reliefHeights, type ReliefParams } from "./relief";

const P: ReliefParams = { ...DEFAULT_RELIEF, border: 0, smooth: 0, edge: 0, gamma: 1 };
const grid = (cols: number, rows: number, f: (c: number, r: number) => number) => Float32Array.from({ length: cols * rows }, (_, i) => f(i % cols, Math.floor(i / cols)));
const range = (a: Float32Array) => [Math.min(...a), Math.max(...a)];
const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;

describe("relevo a partir de foto (#103)", () => {
  const ramp = grid(40, 30, (c) => c / 39);

  it("a altura fica entre a base e a base mais a profundidade máxima", () => {
    const t = reliefHeights(ramp, 40, 30, 0.5, { ...P, base: 1.2, depth: 3 });
    const [lo, hi] = range(t);
    expect(lo).toBeGreaterThanOrEqual(1.2 - 1e-5);
    expect(hi).toBeLessThanOrEqual(4.2 + 1e-5);
    expect(hi - lo).toBeGreaterThan(2.5);
  });

  it("claro é alto; invertido, claro é baixo", () => {
    const t = reliefHeights(ramp, 40, 30, 0.5, P);
    expect(t[39]).toBeGreaterThan(t[0]);
    const inv = reliefHeights(ramp, 40, 30, 0.5, { ...P, invert: true });
    expect(inv[39]).toBeLessThan(inv[0]);
  });

  it("gama maior que 1 escurece a foto e baixa o relevo médio", () => {
    const flat = grid(40, 30, (c, r) => 0.2 + 0.6 * ((c + r) % 7) / 6);
    const a = reliefHeights(flat, 40, 30, 0.5, { ...P, gamma: 1 });
    const b = reliefHeights(flat, 40, 30, 0.5, { ...P, gamma: 2 });
    expect(mean(b)).toBeLessThan(mean(a));
  });

  it("suavização reduz o serrilhado de uma foto com ruído", () => {
    let seed = 7;
    const noise = grid(40, 30, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const rough = (a: Float32Array) => a.reduce((s, v, i) => (i % 40 ? s + Math.abs(v - a[i - 1]) : s), 0);
    const raw = reliefHeights(noise, 40, 30, 0.5, { ...P, smooth: 0 });
    const soft = reliefHeights(noise, 40, 30, 0.5, { ...P, smooth: 1.5 });
    expect(rough(soft)).toBeLessThan(rough(raw) * 0.5);
  });

  it("realce de bordas deixa o degrau mais íngreme em relação ao contraste total", () => {
    const step = grid(60, 30, (c) => (c < 30 ? 0.4 : 0.6));
    const steepness = (t: Float32Array) => {
      let g = 0;
      for (let c = 0; c < 59; c++) g = Math.max(g, Math.abs(t[15 * 60 + c + 1] - t[15 * 60 + c]));
      const [lo, hi] = range(t);
      return g / (hi - lo);
    };
    const a = reliefHeights(step, 60, 30, 0.5, { ...P, smooth: 0.5, edge: 0 });
    const b = reliefHeights(step, 60, 30, 0.5, { ...P, smooth: 0.5, edge: 1 });
    expect(steepness(b)).toBeGreaterThan(steepness(a));
  });

  it("fora do sujeito o fundo fica plano na base", () => {
    const mask = new Uint8Array(40 * 30).map((_, i) => ((i % 40) >= 20 ? 1 : 0));
    const t = reliefHeights(ramp, 40, 30, 0.5, { ...P, base: 1, depth: 3 }, mask);
    for (let r = 0; r < 30; r++) expect(t[r * 40 + 5]).toBeCloseTo(1, 4);
    expect(t[15 * 40 + 39]).toBeGreaterThan(3);
  });

  it("a moldura fica na altura máxima", () => {
    const t = reliefHeights(grid(40, 30, () => 0.5), 40, 30, 0.5, { ...P, border: 2, base: 1, depth: 3 });
    const top = 4;
    expect(t[0]).toBeCloseTo(top, 4);
    expect(t[15 * 40 + 3]).toBeCloseTo(top, 4);
    expect(t[15 * 40 + 20]).toBeLessThan(top);
  });

  it("a malha é um sólido fechado com a altura pedida", () => {
    const m = buildRelief(ramp, 40, 30, 0.5, { ...P, base: 1, depth: 3 });
    expect(signedVolume(m.parts[0].mesh)).toBeGreaterThan(0);
    const zs = Array.from({ length: m.parts[0].mesh.positions.length / 3 }, (_, i) => m.parts[0].mesh.positions[i * 3 + 2]);
    expect(Math.max(...zs)).toBeCloseTo(4, 3);
    expect(Math.min(...zs)).toBeCloseTo(0, 5);
  });
});
