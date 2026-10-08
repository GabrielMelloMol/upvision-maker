import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { applyShapeMask, buildShapedPanel, shapeOutline, shapeSize } from "./lithophaneShaped";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { volume } from "./testUtil";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const area = (pts: [number, number][]) => pts.reduce((s, [x, y], i) => s + (x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y), 0) / 2;
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("contornos do coração e do círculo (#101)", () => {
  test("círculo: diâmetro pedido, área de π r², anti-horário", () => {
    const pts = shapeOutline("circle", 80);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(80, 1);
    expect(area(pts)).toBeGreaterThan(0);
    expect(area(pts)).toBeCloseTo(Math.PI * 40 * 40, -1);
  });

  test("coração: largura pedida, altura na proporção, simétrico, com a ponta embaixo e o vão em cima", () => {
    const { w, h } = shapeSize("heart", 90);
    expect(w).toBe(90);
    expect(h).toBeGreaterThan(75);
    expect(h).toBeLessThan(90);
    const pts = shapeOutline("heart", 90);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(90, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(h, 1);
    expect(Math.abs(Math.max(...xs) + Math.min(...xs))).toBeLessThan(0.5); // centrado
    const tip = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(Math.abs(tip[0])).toBeLessThan(1); // a ponta fica no meio
    const topAtCenter = Math.max(...pts.filter((p) => Math.abs(p[0]) < 3).map((p) => p[1]));
    expect(topAtCenter).toBeLessThan(Math.max(...ys) - 4); // o vão do meio é mais baixo que os lóbulos
    expect(area(pts)).toBeGreaterThan(0);
  });
});

describe("painel em forma de coração ou círculo (#101)", { timeout: 60_000 }, () => {
  const CELL = 0.5;
  const white = (cols: number, rows: number) => new Float32Array(cols * rows).fill(1);

  test("círculo com moldura que segue o contorno: uma peça só, em pé, com pé na mesa", () => {
    const d = 60, n = Math.round(d / CELL) + 1;
    const out = buildShapedPanel(M, white(n, n), n, n, CELL, { shape: "circle", minT: 0.8, maxT: 3, border: 3, plug: null });
    const s = solid(out.mesh);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    const b = meshBounds([out.mesh])!;
    expect(b.min[2]).toBeCloseTo(0, 3); // o pé encosta na mesa
    expect(b.max[0] - b.min[0]).toBeCloseTo(d, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo(14, 1); // o pé tem 14 mm de profundidade; o painel, 3 mm (corte abaixo)
    const centre = solid(out.mesh).slice(out.centerZ).bounds();
    expect(centre.max[1] - centre.min[1]).toBeCloseTo(3, 1); // espessura máxima no painel (a moldura)
    // corte horizontal na altura do centro: miolo branco fino (0,8 mm) entre duas molduras de 3 × 3 mm
    const area = s.slice(out.centerZ).area();
    const core = (d - 2 * 3) * 0.8;
    expect(area).toBeGreaterThan(core + 2 * 9 - 2);
    expect(area).toBeLessThan(core + 2 * 9 + 2);
    // área do miolo: menor que o retângulo, perto da área do círculo
    expect(volume(out.mesh)).toBeLessThan(d * d * 3);
  });

  test("moldura do coração tem a espessura máxima ao longo do contorno; o miolo branco, a mínima", () => {
    const { w, h } = shapeSize("heart", 70);
    const cols = Math.round(w / CELL) + 1, rows = Math.round(h / CELL) + 1;
    const out = buildShapedPanel(M, white(cols, rows), cols, rows, CELL, { shape: "heart", minT: 0.8, maxT: 3, border: 4, plug: null });
    const s = solid(out.mesh);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    // corte na altura do centro do coração: miolo fino de ~0,8 mm entre duas molduras de 3 mm
    const segs = s.slice(out.centerZ).toPolygons();
    const ys = segs.flatMap((p) => p.map((q) => q[1]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 1);
    const b = meshBounds([out.mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(70, 0);
  });

  test("com encaixe de base: a lingueta sai embaixo, na mesa, com a largura pedida e a altura do encaixe", () => {
    const d = 60, n = Math.round(d / CELL) + 1;
    const out = buildShapedPanel(M, white(n, n), n, n, CELL, { shape: "circle", minT: 0.8, maxT: 3, border: 3, plug: { width: 20, depth: 10 } });
    const b = meshBounds([out.mesh])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2] - b.min[2]).toBeCloseTo(d + 10, 0); // o círculo mais a lingueta de 10 mm
    const tab = solid(out.mesh).slice(4).bounds(); // 4 mm acima da mesa: só a lingueta
    expect(tab.max[0] - tab.min[0]).toBeCloseTo(20, 1);
    expect(solid(out.mesh).decompose().length).toBe(1);
  });
});

describe("prévia contra a luz com a forma (#101)", () => {
  test("fora do contorno fica transparente, a moldura escura e o miolo como estava", () => {
    const d = 40, cell = 1, n = d + 1;
    const img = new Uint8ClampedArray(n * n * 4).fill(200);
    const out = applyShapeMask(img, n, n, cell, "circle", 3);
    const px = (c: number, r: number) => [...out.slice((r * n + c) * 4, (r * n + c) * 4 + 4)];
    expect(px(0, 0)[3]).toBe(0); // canto: fora do círculo
    expect(px(20, 20)).toEqual([200, 200, 200, 200]); // centro: como estava
    expect(px(20, 1)).toEqual([0, 0, 0, 255]); // a 1 mm da borda de cima: moldura
    expect(px(1, 20)).toEqual([0, 0, 0, 255]);
    expect(px(20, 5)[0]).toBe(200); // 5 mm da borda: já é miolo (a moldura tem 3 mm)
  });
});
