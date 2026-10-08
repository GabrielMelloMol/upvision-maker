import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { DEFAULT_LITHO } from "./lithophane";
import { LED } from "./lithophaneLed";
import { buildLithophaneSet, lithoGrid } from "./lithophaneSet";
import { fitAspect } from "./lithophaneShapes";
import { getManifold, type ManifoldToplevel } from "./manifold";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const bounds = (m: Model) => meshBounds(m.parts.map((p) => p.mesh))!;
const gray = (w: number, h: number) => Float32Array.from({ length: w * h }, (_, i) => ((i % w) / w) * 0.6 + 0.2);

/** Tamanho da foto em pontos para um formato, como a tela faz: grade pedida, corte na proporção e a peça. */
function run(patch: Partial<typeof DEFAULT_LITHO>, width = 80, cell = 0.5) {
  const p = { ...DEFAULT_LITHO, ...patch };
  const grid = lithoGrid(p, width, cell);
  const src = { w: grid.cols, h: Math.round(grid.cols * 0.75) }; // foto 4:3 já na largura da grade
  const fit = grid.aspect ? fitAspect(gray(src.w, src.h), src.w, src.h, grid.aspect) : { luma: gray(src.w, src.h), w: src.w, h: src.h };
  return { grid, ...buildLithophaneSet(M, fit.luma, fit.w, fit.h, grid.step, p), p };
}

describe("grade por formato (#101)", () => {
  test("plana e curva: como antes, sem corte de proporção", () => {
    const g = lithoGrid({ ...DEFAULT_LITHO, shape: "flat" }, 100, 0.5);
    expect(g.aspect).toBeNull();
    expect(g.cols).toBe(201);
    expect(g.step).toBeCloseTo(0.5, 6);
  });

  test("cilindro: a largura da foto é a volta (π × diâmetro), a proporção vem do diâmetro e da altura", () => {
    const g = lithoGrid({ ...DEFAULT_LITHO, shape: "cylinder", diameter: 80, height: 100 }, 999, 0.5);
    const volta = (Math.PI * 80) / 100; // proporção da volta pela altura
    expect(g.aspect!).toBeGreaterThan(volta); // mais a sobra da emenda (5% da volta)
    expect(g.aspect!).toBeLessThan(volta * 1.08);
    expect(g.cols * g.step).toBeGreaterThan(Math.PI * 80 * 0.99); // a volta toda, mais a sobra para a emenda
  });

  test("coração e círculo: o círculo é quadrado, o coração um pouco mais largo que alto", () => {
    expect(lithoGrid({ ...DEFAULT_LITHO, shape: "circle" }, 80, 0.5).aspect).toBeCloseTo(1, 2);
    expect(lithoGrid({ ...DEFAULT_LITHO, shape: "heart" }, 80, 0.5).aspect).toBeCloseTo(1 / 0.905, 1);
  });

  test("detalhe limitado: foto grande demais para o cilindro usa um passo maior que o pedido", () => {
    const g = lithoGrid({ ...DEFAULT_LITHO, shape: "cylinder", diameter: 150, height: 200 }, 100, 0.15);
    expect(g.step).toBeGreaterThan(0.15);
  });
});

describe("peças de cada formato com a base de LED (#101)", { timeout: 120_000 }, () => {
  test("cilindro: tubo com o diâmetro e a altura pedidos, em pé, mais a base redonda, a tampa de baixo e a tampa de cima", () => {
    const { models, warnings } = run({ shape: "cylinder", diameter: 70, height: 60, led: { kind: "disc", size: 40, power: "cable" }, lid: true });
    expect(warnings).toEqual([]);
    expect(models.map((m) => m.name)).toEqual(["Litofania", "Base de LED", "Tampa da base", "Tampa do abajur"]);
    const tube = bounds(models[0]);
    expect(tube.max[0] - tube.min[0]).toBeCloseTo(70, 0);
    expect(tube.max[2] - tube.min[2]).toBeGreaterThan(55);
    expect(tube.max[2] - tube.min[2]).toBeLessThan(65);
    expect(tube.min[2]).toBeCloseTo(0, 3);
    expect(bounds(models[1]).max[0] - bounds(models[1]).min[0]).toBeCloseTo(70 + 2 * LED.ring, 0);
  });

  test("peças na mesa sem se tocar, dentro dela, e as duas cores (peça branca, base escura)", () => {
    const { models } = run({ shape: "heart", led: { kind: "strip", size: 10, power: "battery" } });
    const bs = models.map(bounds);
    bs.forEach((a, i) =>
      bs.slice(i + 1).forEach((b) => {
        const apart = a.max[0] + 5 <= b.min[0] || b.max[0] + 5 <= a.min[0] || a.max[1] + 5 <= b.min[1] || b.max[1] + 5 <= a.min[1];
        expect(apart).toBe(true);
      }),
    );
    for (const b of bs) expect(b.min[2]).toBeGreaterThanOrEqual(-1e-6);
    const all = meshBounds(models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
    expect(Math.abs((all.min[0] + all.max[0]) / 2)).toBeLessThan(1); // centradas na origem (a mesa)
    expect(models[0].parts[0].color).toBe(DEFAULT_LITHO.color);
    expect(models[1].parts[0].color).not.toBe(DEFAULT_LITHO.color);
  });

  test("peças largas demais para uma linha vão para a linha de baixo, dentro da mesa de 256 mm", () => {
    const { models } = run({ shape: "cylinder", diameter: 120, height: 60, led: { kind: "disc", size: 50, power: "cable" }, lid: true });
    const all = meshBounds(models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
    expect(all.max[0] - all.min[0]).toBeLessThanOrEqual(256 - 2 * 4 + 1e-6);
    expect(new Set(models.map((m) => Math.round((bounds(m).min[1] + bounds(m).max[1]) / 2 / 5))).size).toBeGreaterThan(1); // mais de uma linha
  });

  test("a lingueta da peça entra no encaixe da base: a espessura e a largura combinam", () => {
    for (const shape of ["flat", "circle", "heart"] as const) {
      const { models } = run({ shape, led: { kind: "disc", size: 30, power: "cable" } });
      const piece = bounds(models[0]);
      expect(piece.min[2]).toBeCloseTo(0, 3);
      // o corte de 2 mm acima da mesa pega só a lingueta: sua espessura é a máxima da moldura
      expect(piece.max[1] - piece.min[1]).toBeGreaterThan(DEFAULT_LITHO.maxT - 0.05);
    }
  });

  test("curva e caixa não têm base de LED: avisa e entrega só a peça", () => {
    const { models, warnings } = run({ shape: "curved", led: { kind: "disc", size: 30, power: "cable" } });
    expect(models).toHaveLength(1);
    expect(warnings.join()).toMatch(/plana, cilindro, coração e círculo/);
  });

  test("sem base: coração e círculo levam um pé; cilindro vem só o tubo", () => {
    expect(run({ shape: "circle" }).models).toHaveLength(1);
    expect(run({ shape: "cylinder", diameter: 60, height: 50 }).models).toHaveLength(1);
  });
});
