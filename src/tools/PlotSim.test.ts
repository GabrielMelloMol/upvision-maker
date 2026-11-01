import { expect, test } from "vitest";
import { progress } from "./PlotSim";

test("simulação: até onde a caneta chegou, com o pedaço do traço atual (#317)", () => {
  const strokes: [number, number][][] = [[[0, 0], [10, 0]], [[0, 5], [0, 15]]];
  expect(progress(strokes, 5)).toEqual({ lines: [[[0, 0], [5, 0]]], tip: [5, 0] });
  expect(progress(strokes, 12)).toEqual({ lines: [[[0, 0], [10, 0]], [[0, 5], [0, 7]]], tip: [0, 7] });
  expect(progress(strokes, 99)).toEqual({ lines: strokes, tip: null });
  expect(progress(strokes, 0).tip).toEqual([0, 0]);
});
