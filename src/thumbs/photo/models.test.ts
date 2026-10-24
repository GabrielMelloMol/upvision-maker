import { describe, expect, it } from "vitest";
import type { Model } from "../../geometry/types";
import { meanLuma } from "./models";

/** Uma parte com `tris` triângulos (a posição não importa para a cor). */
const part = (color: string, tris: number) => ({ name: color, color, mesh: { positions: new Float32Array(9), indices: new Uint32Array(tris * 3) } });

describe("foto realista: mesa escura para peça clara", () => {
  it("pesa a cor pelo tamanho de cada parte", () => {
    const white: Model[] = [{ name: "a", parts: [part("#ffffff", 9), part("#e8613c", 1)] }];
    const orange: Model[] = [{ name: "b", parts: [part("#ffffff", 1), part("#e8613c", 9)] }];
    expect(meanLuma(white)).toBeGreaterThan(0.6);
    expect(meanLuma(orange)).toBeLessThan(0.6);
  });

  it("sem partes, não pede mesa escura", () => {
    expect(meanLuma([])).toBe(0);
  });
});
