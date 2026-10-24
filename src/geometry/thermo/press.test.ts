import { describe, expect, test } from "vitest";
import { morphAt, writeMorph, type PressMorph } from "./press";

const mesh = (z: number[]) => ({ positions: Float32Array.from(z.flatMap((v) => [1, 2, v])), indices: Uint32Array.from([0, 1, 2]) });
// uma tela de 3 vértices que afunda 10 mm e um macho de 3 vértices
const MO: PressMorph = {
  parts: [{ color: "#fff", flat: mesh([0, 0, 0]), pressed: mesh([0, -10, -5]) }],
  travel: 40,
  hover: 12,
  male: { name: "macho", previewOnly: true, parts: [{ name: "macho", color: "#000", mesh: mesh([5, 6, 7]) }] },
  female: { name: "fêmea", previewOnly: true, parts: [] },
};

describe("animação da prensagem (#270)", () => {
  test("começa aberta (macho no alto, tela plana pairando), fecha com a casca formada e termina com o macho de volta e a casca na fêmea", () => {
    expect(morphAt(MO, 0)).toEqual({ male: 40, sheet: 12, blend: 0 });
    const mid = morphAt(MO, 0.5);
    expect(mid.male).toBeLessThan(40);
    expect(morphAt(MO, 0.6)).toEqual({ male: 0, sheet: 0, blend: 1 });
    expect(morphAt(MO, 1)).toEqual({ male: 40, sheet: 0, blend: 1 });
  });

  test("a tela só vira casca quando o macho encosta nela, e desce junto com ele", () => {
    for (let u = 0; u <= 0.6; u += 0.01) {
      const f = morphAt(MO, u);
      expect(f.sheet).toBe(Math.min(MO.hover, f.male));
      expect(f.blend).toBeCloseTo(1 - f.sheet / MO.hover, 9);
    }
  });

  test("o macho desce sem voltar e sobe sem descer (sem tranco)", () => {
    let last = Infinity;
    for (let u = 0; u <= 0.6; u += 0.01) {
      const m = morphAt(MO, u).male;
      expect(m).toBeLessThanOrEqual(last);
      last = m;
    }
    for (let u = 0.6; u <= 1; u += 0.01) {
      const m = morphAt(MO, u).male;
      expect(m).toBeGreaterThanOrEqual(last);
      last = m;
    }
  });

  test("escreve os vértices no lugar: plana e erguida no começo, casca no fim, macho subido pelo curso", () => {
    const out = { male: new Float32Array(9), sheets: [new Float32Array(9)] };
    writeMorph(MO, 0, out);
    expect([...out.sheets[0]]).toEqual([1, 2, 12, 1, 2, 12, 1, 2, 12]);
    expect([...out.male]).toEqual([1, 2, 45, 1, 2, 46, 1, 2, 47]);
    writeMorph(MO, 0.6, out);
    expect([...out.sheets[0]]).toEqual([...MO.parts[0].pressed.positions]);
    expect([...out.male]).toEqual([...MO.male.parts[0].mesh.positions]);
  });
});
