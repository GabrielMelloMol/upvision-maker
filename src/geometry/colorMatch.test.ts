import { expect, test } from "vitest";
import { deltaE2000Lab, mergeClosest, nearestColor } from "./colorMatch";

test("ΔE2000 bate com os pares de referência de Sharma, Wu e Dalal (2005)", () => {
  const pairs: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  for (const [a, b, want] of pairs) expect(deltaE2000Lab(a, b)).toBeCloseTo(want, 3);
});

test("cor mais próxima entre os filamentos", () => {
  expect(nearestColor("#e01010", ["#ffffff", "#c00000", "#1c1c1e"])).toBe("#c00000");
  expect(nearestColor("#123456", [])).toBeNull();
});

test("juntar as cores mais parecidas até caber no AMS", () => {
  const map = mergeClosest(["#ffffff", "#f5f5f5", "#000000", "#ff0000", "#e00000", "#0000ff"], 4);
  const out = new Set(Object.values(map));
  expect(out.size).toBe(4);
  expect(map["#f5f5f5"]).toBe(map["#ffffff"]); // brancos juntos
  expect(map["#e00000"]).toBe(map["#ff0000"]); // vermelhos juntos
  expect(map["#0000ff"]).toBe("#0000ff");
  // já cabe: nada muda
  expect(mergeClosest(["#ffffff", "#000000"], 4)).toEqual({ "#ffffff": "#ffffff", "#000000": "#000000" });
});
