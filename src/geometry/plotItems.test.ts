import { expect, test } from "vitest";
import { boxStl } from "../test/boxStl";
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

test("texto: espaço entre letras alarga e entre linhas afasta (#320)", async () => {
  const base = { ...newItem("text", at), text: "Oi\nOi" };
  const span = async (gap: number, lineK: number) => {
    const pts = (await itemLines({ ...base, gap, lineK }, {}))!.flatMap((l) => l.pts);
    return [Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))];
  };
  const [w0, h0] = await span(0, 1);
  const [w1, h1] = await span(10, 2);
  expect(w1).toBeCloseTo(w0 + 10);
  expect(h1).toBeGreaterThan(h0 + 25);
});

test("rascunho de antes das camadas vira uma camada no meio (#320)", () => {
  const [it] = legacyItems({ source: "text", text: "Oi", lettering: "single", width: 80, fill: { mode: "both", spacing: 1, angle: 45, cross: false } }, [128, 120]);
  expect(it).toMatchObject({ kind: "text", text: "Oi", w: 80, x: 128, y: 120, rot: 0, fill: { mode: "both" } });
  expect(legacyItems({ source: "design", svg: null }, [0, 0])).toEqual([]);
  expect(legacyItems({}, [0, 0])).toEqual([]);
});
