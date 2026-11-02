import { expect, test } from "vitest";
import { boxStl } from "../test/boxStl";
import { STROKE_FONT_LIST } from "./hershey";
import { modelOutline } from "./modelOutline";
import { itemLines, legacyItems, newItem } from "./plotItems";
import { placeLines } from "./plotter";
import { SHAPES, shapeLines } from "./plotShapes";

const at = { x: 100, y: 100, w: 50, rot: 0 };

test("toda forma pronta tem traço e cabe na largura pedida (#320)", () => {
  for (const [kind] of SHAPES) {
    const lines = shapeLines({ kind, n: 5, ratio: 0.5 });
    expect(lines.length, kind).toBeGreaterThan(0);
    const { strokes, w } = placeLines(lines, at);
    expect(w, kind).toBeCloseTo(50);
    for (const s of strokes) for (const [x] of s) expect(Math.abs(x - 100), kind).toBeLessThanOrEqual(25.001);
  }
  expect(shapeLines({ kind: "star", n: 6, ratio: 1 })[0].pts).toHaveLength(12);
  expect(shapeLines({ kind: "polygon", n: 3, ratio: 1 })[0].pts).toHaveLength(3);
  const rect = placeLines(shapeLines({ kind: "rect", n: 0, ratio: 0.5 }), at);
  expect(rect.h).toBeCloseTo(25);
});

test("peça 3D: o contorno visto de cima de um bloco é o retângulo dele (#320)", async () => {
  const lines = await modelOutline(boxStl(30, 12, 8), "bloco.stl");
  expect(lines).toHaveLength(1);
  const xs = lines[0].pts.map((p) => p[0]);
  const ys = lines[0].pts.map((p) => p[1]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(30);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(12);
  await expect(modelOutline(new Uint8Array(10), "peca.obj")).rejects.toThrow(/\.stl ou \.3mf/);
});

const extent = (lines: { pts: [number, number][] }[]) => {
  const pts = lines.flatMap((l) => l.pts);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

test("texto: espaço entre letras alarga e entre linhas afasta, na escala da letra (#320, #324)", async () => {
  const base = { ...newItem("text", at), text: "Oi\nOi", w: 200, size: 21 }; // 21 mm = 1 mm por unidade da letra
  const span = async (gap: number, lineK: number) => extent((await itemLines({ ...base, gap, lineK }, {}))!);
  const a = await span(0, 1);
  const b = await span(10, 2);
  expect(b.w).toBeCloseTo(a.w + 10);
  expect(b.h).toBeGreaterThan(a.h + 25);
});

test("texto em caixa: a letra tem o tamanho pedido e escrever mais quebra a linha em vez de diminuir (#324)", async () => {
  const one = { ...newItem("text", at), text: "H", stroke: "futural" as const, size: 10, w: 100, align: "left" as const };
  expect(extent((await itemLines(one, {}))!).h).toBeCloseTo(10, 0);
  const long = { ...one, text: "Hoje tem bolo de chocolate na casa da vovó" };
  const e = extent((await itemLines(long, {}))!);
  expect(e.w).toBeLessThanOrEqual(100.01); // cabe na caixa
  expect(e.h).toBeGreaterThan(30); // virou várias linhas
  // à direita: as linhas encostam no fim da caixa
  const right = extent((await itemLines({ ...one, text: "Oi", align: "right" }, {}))!);
  expect(right.x1).toBeCloseTo(100, 0);
  // na mesa: a caixa fica centrada no lugar do item, sem escalar
  const placed = placeLines((await itemLines({ ...one, text: "Oi", align: "left" }, {}))!, one, true);
  expect(placed.w).toBe(100);
  expect(Math.min(...placed.strokes.flat().map((p) => p[0]))).toBeCloseTo(at.x - 50, 0);
});

test("toda letra de traço desenha o alfabeto (#324)", async () => {
  for (const [stroke] of STROKE_FONT_LIST) {
    const lines = await itemLines({ ...newItem("text", at), text: "AbcÁç 123", stroke }, {});
    expect(lines!.length, stroke).toBeGreaterThan(8);
  }
});

test("rascunho de antes das camadas vira uma camada no meio (#320)", () => {
  const [it] = legacyItems({ source: "text", text: "Oi", lettering: "single", width: 80, fill: { mode: "both", spacing: 1, angle: 45, cross: false } }, [128, 120]);
  expect(it).toMatchObject({ kind: "text", text: "Oi", w: 80, x: 128, y: 120, rot: 0, fill: { mode: "both" } });
  expect(legacyItems({ source: "design", svg: null }, [0, 0])).toEqual([]);
  expect(legacyItems({}, [0, 0])).toEqual([]);
});
