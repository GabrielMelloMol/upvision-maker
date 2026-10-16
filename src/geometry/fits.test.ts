import { afterEach, expect, test } from "vitest";
import { fitValue, setFits, validatedFit } from "./fits";
import { COUPONS } from "./testKit/catalog";

afterEach(() => setFits(null));

test("sem nada lançado vale o padrão de fábrica de cada ferramenta", () => {
  for (const c of COUPONS) {
    expect(validatedFit(c.fitKey)).toBeUndefined();
    expect(fitValue(c.fitKey)).toBe(c.fallback);
  }
});

test("a folga lançada vale no lugar do padrão, só para a chave dela", () => {
  setFits({ threadClearance: 0.4, hingeClearance: 0.2 });
  expect(fitValue("threadClearance")).toBe(0.4);
  expect(fitValue("hingeClearance")).toBe(0.2);
  expect(fitValue("cupClearance")).toBe(0.5);
  setFits(null);
  expect(fitValue("threadClearance")).toBe(0.35);
});

test("todo número da varredura cai dentro de uma faixa que faz sentido e o padrão de hoje está nela", () => {
  for (const c of COUPONS) {
    expect(c.sweep.length, c.id).toBeGreaterThanOrEqual(3);
    expect(c.sweep, c.id).toEqual([...c.sweep].sort((a, b) => a - b));
    expect(c.sweep, c.id).toContain(c.fallback);
  }
});
