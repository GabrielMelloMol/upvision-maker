import { expect, test } from "vitest";
import { cutleryPlan, TRAY_DEPTH } from "./cutleryPlan";

test("gaveta funda (500 mm): 2 andares, bandeja desliza na profundidade, trilhos tiram largura da base (#140)", () => {
  const p = cutleryPlan({ width: 500, depth: 500, height: 110 });
  expect(p.levels).toBe(2);
  expect(p.slide).toBe("depth");
  expect(p.trays.length).toBe(2); // 500 mm não cabe numa bandeja só na mesa
  for (const t of p.trays) expect(t.width).toBeLessThanOrEqual(250);
  expect(p.trays.reduce((s, t) => s + t.width, 0)).toBeLessThanOrEqual(p.innerWidth - 2 * p.railWidth);
  expect(p.trayDepth).toBe(TRAY_DEPTH);
  expect(p.baseWidth).toBeCloseTo(500 - 2 * p.railWidth, 3);
  // andar de baixo: da base até a borda do trilho, com folga para a bandeja
  expect(p.lowerHeight + p.trayHeight).toBeLessThanOrEqual(110);
  expect(p.lowerHeight).toBeGreaterThanOrEqual(40);
  expect(p.notes.join(" ")).toMatch(/desliza/);
});

test("gaveta rasa em profundidade: bandeja removível (não desliza), explicando", () => {
  const p = cutleryPlan({ width: 500, depth: 420, height: 110 });
  expect(p.levels).toBe(2);
  expect(p.slide).toBe("none");
  expect(p.notes.join(" ")).toMatch(/levanta|remov/i);
});

test("altura útil abaixo de 80 mm: 1 andar só, com sugestão", () => {
  const p = cutleryPlan({ width: 400, depth: 450, height: 70 });
  expect(p.levels).toBe(1);
  expect(p.notes.join(" ")).toMatch(/80 mm/);
});

test("obstáculo nas laterais (trilho metálico) tira da largura útil", () => {
  const a = cutleryPlan({ width: 500, depth: 500, height: 110 });
  const b = cutleryPlan({ width: 500, depth: 500, height: 110, sideObstacle: 12 });
  expect(b.innerWidth).toBe(a.innerWidth - 24);
});

test("gaveta estreita demais para as 4 divisões de talheres avisa", () => {
  const p = cutleryPlan({ width: 200, depth: 500, height: 110 });
  expect(p.notes.join(" ")).toMatch(/estreit/);
});
