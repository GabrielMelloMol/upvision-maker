import { describe, expect, test } from "vitest";
import { layoutReport, type DrawerLayout } from "./layout";
import { applyPreset, DRAWER_PRESETS } from "./presets";

describe("exemplos de gaveta", () => {
  for (const preset of DRAWER_PRESETS)
    for (const [cols, rows] of [[11, 9], [4, 3], [2, 2]] as const)
      test(`${preset.label} em ${cols} × ${rows}: tem caixinhas, nenhuma sobreposta nem fora, etiquetas e altura limitada`, () => {
        const out = applyPreset({ cols, rows, modules: [] }, preset, 4);
        expect(out.modules.length).toBeGreaterThan(0);
        const r = layoutReport(out);
        expect(r.collisions).toEqual([]);
        expect(r.outside).toEqual([]);
        expect(out.modules.every((m) => m.label && m.u <= 4)).toBe(true);
      });

  test("troca o que já estava no mapa (começa do zero)", () => {
    const first = applyPreset({ cols: 6, rows: 4, modules: [] }, DRAWER_PRESETS[0], 10);
    const again: DrawerLayout = applyPreset(first, DRAWER_PRESETS[1], 10);
    expect(again.modules.some((m) => m.label === "Canetas")).toBe(false);
    expect(again.modules.some((m) => m.label === "Alicates")).toBe(true);
  });
});
