import { describe, expect, test } from "vitest";
import type { ToolOutline } from "../types";
import { A4, findSheetCorners, lightness, measureTools, rescale, sizeMm } from "./index";
import { signedArea } from "./contour";
import { renderScene, type Scene } from "./testPhoto";

/** Celular a ~42 cm da mesa, de lado e girado (foto de 1600 × 1200, focal ~26 mm equivalente). */
const BASE: Scene = {
  sheet: { w: 210, h: 297 },
  boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }],
  camera: [160, 330, 420],
  target: [105, 150, 0],
  focalPx: 1300,
  size: [1600, 1200],
  roll: 8,
};

function run(scene: Scene, heightMm = 0, focal: number | null = scene.focalPx) {
  const g = lightness(renderScene(scene));
  const corners = findSheetCorners(g)!;
  return measureTools(g, { sheet: A4, corners, heightMm, focalPx: focal });
}

/** Caixa alinhada à folha (o retângulo da cena também está). */
const contourSize = (pts: [number, number][]) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

/** Lados do retângulo medido (menor, maior). */
const dims = (o: ToolOutline) => {
  const s = contourSize(o.points);
  return [Math.min(s.w, s.h), Math.max(s.w, s.h)];
};

// cada teste renderiza fotos de 1600 × 1200 com supersample (≈ 1 s cada)
describe("foto → contornos em mm (#169)", { timeout: 60_000 }, () => {
  test("retângulo de 100 × 40 mm deitado, foto inclinada: erro abaixo de 0,5 mm, contorno anti-horário", () => {
    const r = run(BASE);
    expect(r.outlines).toHaveLength(1);
    const [short, long] = dims(r.outlines[0]);
    expect(Math.abs(long - 100)).toBeLessThan(0.5);
    expect(Math.abs(short - 40)).toBeLessThan(0.5);
    expect(signedArea(r.outlines[0].points)).toBeGreaterThan(0);
    expect(r.sheet).toEqual({ widthMm: 210, heightMm: 297 });
    expect(r.warnings).toEqual([]);
  });

  test("bloco de 20 mm de altura: sem corrigir sai maior; com a altura e a focal volta a 100 × 40 (± 0,5 mm)", () => {
    const tall: Scene = { ...BASE, boxes: [{ ...BASE.boxes[0], h: 20 }] };
    const raw = dims(run(tall).outlines[0]);
    expect(raw[1] - 100).toBeGreaterThan(2); // paralaxe de verdade
    const r = run(tall, 20);
    const [short, long] = dims(r.outlines[0]);
    expect(Math.abs(long - 100)).toBeLessThan(0.5);
    expect(Math.abs(short - 40)).toBeLessThan(0.5);
    expect(r.camera!.distanceMm).toBeGreaterThan(400);
    expect(r.outlines[0].heightMm).toBe(20);
  });

  test("sem focal (sem EXIF): pede a régua; reescalar pelo comprimento medido acerta o tamanho", () => {
    const tall: Scene = { ...BASE, camera: [105, 150, 420], boxes: [{ ...BASE.boxes[0], h: 20 }] }; // de cima
    const r = run(tall, 20, null);
    expect(r.needsRuler).toBe(true);
    const o = r.outlines[0];
    const fixed = rescale(o, 100 / sizeMm(o).length);
    expect(Math.abs(dims(fixed)[0] - 40)).toBeLessThan(0.5);
  });

  test("várias ferramentas, uma com furo (argola): contornos separados, furo horário", () => {
    const scene: Scene = {
      ...BASE,
      boxes: [
        { x: 30, y: 40, w: 60, d: 20, h: 0 },
        { x: 120, y: 40, w: 40, d: 8, h: 0 },
        { x: 120, y: 48, w: 8, d: 32, h: 0 },
        { x: 152, y: 48, w: 8, d: 32, h: 0 },
        { x: 120, y: 80, w: 40, d: 8, h: 0 },
        { x: 40, y: 200, w: 120, d: 15, h: 0 },
      ],
    };
    const r = run(scene);
    expect(r.outlines).toHaveLength(3);
    const ring = r.outlines.find((o) => o.holes?.length)!;
    expect(ring.holes).toHaveLength(1);
    expect(signedArea(ring.holes![0])).toBeLessThan(0);
    const hole = contourSize(ring.holes![0]);
    expect(Math.abs(Math.min(hole.w, hole.h) - 24)).toBeLessThan(0.5);
  });

  test("avisos: objeto saindo da folha, sombra forte e folha muito inclinada", () => {
    const out = run({ ...BASE, boxes: [{ x: 150, y: 120, w: 80, d: 30, h: 0 }] });
    expect(out.warnings.join(" ")).toMatch(/sai da folha/);
    const shadow = run({ ...BASE, shadow: { width: 25, strength: 0.7 } });
    expect(shadow.warnings.join(" ")).toMatch(/Sombra forte/);
    const steep = run({ ...BASE, camera: [105, 520, 260], target: [105, 150, 0], roll: 0 });
    expect(steep.warnings.join(" ")).toMatch(/muito inclinada/);
    const cut = run({ ...BASE, camera: [40, -60, 300], roll: 20 });
    expect(cut.warnings.join(" ")).toMatch(/não aparece inteira/);
  });

  test("comprimento × largura como a régua mede, mesmo com a ferramenta girada", () => {
    const a = (30 * Math.PI) / 180;
    const rot = ([x, y]: [number, number]): [number, number] => [x * Math.cos(a) - y * Math.sin(a) + 80, x * Math.sin(a) + y * Math.cos(a) + 60];
    const points = ([[0, 0], [100, 0], [100, 40], [0, 40]] as [number, number][]).map(rot);
    const s = sizeMm({ id: "x", points });
    expect(s.length).toBeCloseTo(100, 6);
    expect(s.width).toBeCloseTo(40, 6);
  });
});
