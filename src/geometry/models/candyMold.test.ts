import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildCandyMold, DEFAULT_CANDY_MOLD, type CandyMoldParams } from "./candyMold";
import { testArt } from "./sampleArt";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null);
const ctx = (extra: Partial<ModelCtx> = {}): ModelCtx => ({ M, art: null, text, ...extra });
const candy = (p: Partial<CandyMoldParams> = {}, c = ctx()) => buildCandyMold(c, { ...DEFAULT_CANDY_MOLD, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const model = (o: ReturnType<typeof candy>, name: string) => o.models.find((m) => m.name === name)!;

/** Área da cavidade (mm²) lida da forma: a área dos furos da fatia no meio da altura. */
function cavityArea(mesh: Mesh): number {
  const s = solid(mesh);
  const b = s.boundingBox();
  const cs = s.slice((b.min[2] + b.max[2]) / 2);
  const area = cs.toPolygons().reduce((a, poly) => {
    let sum = 0;
    for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; sum += x1 * y2 - x2 * y1; }
    return sum < 0 ? a - sum / 2 : a; // furos têm área com sinal negativo
  }, 0);
  [s, cs].forEach((o) => o.delete());
  return area;
}

describe("docinho pelo peso: a cavidade tem o volume que o peso pede (#220)", { timeout: 60_000 }, () => {
  test.each([
    ["heart", 25, 1.2],
    ["star", 18, 1.2],
    ["flower", 25, 1.1],
    ["bar", 30, 1.3],
    ["round", 12, 1.2],
  ] as const)("%s com %i g a %d g/cm³: área × altura = volume (±2%%)", (shape, weight, density) => {
    const out = candy({ shape, weight, density, depth: 14 });
    const area = cavityArea(model(out, "Forma").parts[0].mesh);
    const wanted = (weight / density) * 1000;
    expect(area * 14 / wanted, `${shape}`).toBeGreaterThan(0.98);
    expect(area * 14 / wanted, `${shape}`).toBeLessThan(1.02);
  });

  test("mais peso ou mais denso/menos denso: a cavidade acompanha; a altura muda a área, não o volume", () => {
    const a = (p: Partial<CandyMoldParams>) => cavityArea(model(candy(p), "Forma").parts[0].mesh);
    expect(a({ weight: 40 })).toBeGreaterThan(a({ weight: 20 }) * 1.9);
    expect(a({ density: 1.0 })).toBeGreaterThan(a({ density: 1.5 }) * 1.4); // doce menos denso ocupa mais
    const area10 = a({ depth: 10 }) * 10, area20 = a({ depth: 20 }) * 20;
    expect(area10 / area20).toBeGreaterThan(0.97);
    expect(area10 / area20).toBeLessThan(1.03);
  });

  test("desenho próprio vira a forma, com o mesmo volume", () => {
    const out = candy({ shape: "art", weight: 25 }, ctx({ art: testArt(M) }));
    const area = cavityArea(model(out, "Forma").parts[0].mesh);
    expect(area * 14 / ((25 / 1.2) * 1000)).toBeGreaterThan(0.97);
  });

  test("a altura da forma é a do docinho mais a espessura do êmbolo; forma e êmbolo lado a lado", () => {
    const out = candy({ depth: 14 });
    const f = meshBounds([model(out, "Forma").parts[0].mesh])!;
    expect(f.max[2] - f.min[2]).toBeCloseTo(14 + 2.5, 1);
    const e = meshBounds([model(out, "Ejetor").parts[0].mesh])!;
    expect(e.min[0]).toBeGreaterThan(f.max[0]); // não se sobrepõem na mesa
  });

  test("a informação diz as medidas, o volume e as gramas", () => {
    const info = candy().warnings![0];
    expect(info).toMatch(/Cavidade de [\d,]+ × [\d,]+ mm e 14 mm de altura = 20,8 cm³: cabe 25 g de doce a 1,20 g\/cm³/);
  });

  test("marca no êmbolo: texto ou desenho rebaixa o rosto do êmbolo (o doce sai com a marca em relevo); sem marca, êmbolo inteiro", () => {
    const plain = solid(model(candy(), "Ejetor").parts[0].mesh);
    const withText = solid(model(candy({ stampText: "Ana" }), "Ejetor").parts[0].mesh);
    const withArt = solid(model(candy({}, ctx({ art2: testArt(M) })), "Ejetor").parts[0].mesh);
    expect(withText.volume()).toBeLessThan(plain.volume() - 2);
    expect(withArt.volume()).toBeLessThan(plain.volume() - 2);
    // o rebaixo fica na face de baixo (z = 0..0,8) e o êmbolo continua numa peça só
    const bottom = M.Manifold.cube([200, 200, 0.8], false).translate([-100, -100, 0]);
    const lost = plain.intersect(bottom).volume() - withText.intersect(bottom).volume();
    expect(lost).toBeGreaterThan(2);
    expect(withText.decompose().length).toBe(1);
    [plain, withText, withArt, bottom].forEach((o) => o.delete());
  });

  test("forma de teste: cavidade de 10 cm³ (área × 20 mm), sem marca; avisa como calibrar a densidade", () => {
    const out = candy({ print: "test", stampText: "Ana" });
    const area = cavityArea(model(out, "Forma").parts[0].mesh);
    expect(area * 20 / 10000).toBeGreaterThan(0.98);
    expect(area * 20 / 10000).toBeLessThan(1.02);
    expect(out.warnings![0]).toMatch(/densidade = gramas ÷ 10/);
  });

  test("avisa quando a forma ficaria pequena ou grande demais", () => {
    expect(candy({ weight: 5, depth: 30 }).warnings!.join(" ")).toMatch(/ficou pequena/);
    expect(candy({ weight: 80, depth: 8, density: 0.8 }).warnings!.join(" ")).toMatch(/ficou grande/);
  });

  test("docinho fantasma: translúcido e só na prévia, na altura do docinho, com a marca em relevo no topo; sem marca fica liso", () => {
    const withMark = candy({ stampText: "Ana" });
    const ghost = withMark.models.find((m) => m.previewOnly)!;
    expect(ghost.parts[0].ghost).toBe(true);
    expect(ghost.parts[0].name).toBe("");
    const gb = meshBounds([ghost.parts[0].mesh])!;
    expect(gb.min[2]).toBeCloseTo(0, 2);
    expect(gb.max[2]).toBeCloseTo(14 + 0.8, 1); // altura do docinho + relevo da marca
    const smooth = meshBounds([candy().models.find((m) => m.previewOnly)!.parts[0].mesh])!;
    expect(smooth.max[2]).toBeCloseTo(14, 1);
    // à frente da forma, sem sobrepor
    const fb = meshBounds([model(withMark, "Forma").parts[0].mesh])!;
    expect(gb.max[1]).toBeLessThan(fb.min[1]);
    // o volume do doce fantasma é o do peso (cavidade cheia)
    const body = solid(candy().models.find((m) => m.previewOnly)!.parts[0].mesh);
    expect(body.volume() / ((25 / 1.2) * 1000)).toBeGreaterThan(0.97);
    body.delete();
    expect(candy({ showCandy: false }).models.some((m) => m.previewOnly)).toBe(false);
    expect(candy({ print: "test" }).models.some((m) => m.previewOnly)).toBe(false);
    expect(withMark.models.filter((m) => !m.previewOnly).map((m) => m.name)).toEqual(["Forma", "Ejetor"]);
  });
});
