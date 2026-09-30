import { expect, test } from "vitest";
import { perfLine } from "./perf";

test("linha de desempenho do Copiar informações (#88)", () => {
  expect(perfLine({ now: () => 0, memory: { usedJSHeapSize: 42 * 1024 * 1024 } }, 1432)).toBe("Abertura: 1,4 s · memória JS: 42 MB");
  expect(perfLine({ now: () => 0 }, 380)).toBe("Abertura: 0,4 s"); // Safari não informa a memória
  expect(perfLine({ now: () => 0 }, null)).toBeNull();
});
