import { expect, test } from "vitest";
import { drawerShape } from "./drawerShape";

const len = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("cotas medem o vão interno digitado: largura, profundidade e altura útil até o móvel de cima (#140)", () => {
  const { measures, panels } = drawerShape(500, 420, 80);
  const by = Object.fromEntries(measures.map((m) => [m.key, m]));
  expect(len(by.width.from, by.width.to)).toBeCloseTo(500);
  expect(len(by.depth.from, by.depth.to)).toBeCloseTo(420);
  expect(len(by.height.from, by.height.to)).toBeCloseTo(80);
  expect(by.width.label).toBe("500 mm");
  // o móvel de cima começa exatamente na altura útil; as laterais ficam abaixo dela
  const top = panels.find((p) => p.kind === "top")!;
  expect(top.center[2] - top.size[2] / 2).toBeCloseTo(80);
  const side = panels.find((p) => p.name === "Lateral direita")!;
  expect(side.center[2] + side.size[2] / 2).toBeLessThan(80);
  // o vão interno fica livre: as laterais começam na borda de dentro
  expect(side.center[0] - side.size[0] / 2).toBeCloseTo(250);
});

test("muda na hora com as medidas", () => {
  const a = drawerShape(300, 200, 60).measures[0];
  const b = drawerShape(600, 200, 60).measures[0];
  expect(b.to[0] - b.from[0]).toBe(2 * (a.to[0] - a.from[0]));
});
