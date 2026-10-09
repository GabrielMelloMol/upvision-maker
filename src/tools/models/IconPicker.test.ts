// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { designFromSvg } from "../designInput";
import { getManifold } from "../../geometry/manifold";
import { iconSvg, KEY_ICONS } from "./IconPicker";

beforeAll(async () => {
  await getManifold();
});

describe("ícones Lucide como desenho (#115)", () => {
  test("cada ícone vira SVG de traço preto (sem currentColor) que o leitor transforma em região não vazia", async () => {
    for (const i of KEY_ICONS) {
      const svg = await iconSvg(i.icon);
      expect(svg).toMatch(/^<svg /);
      expect(svg).toContain('stroke="#000000"');
      expect(svg).not.toContain("currentColor");
      const d = await designFromSvg(svg, 100, false, true);
      expect(d.cs.isEmpty(), i.name).toBe(false);
      expect(d.cs.area(), i.name).toBeGreaterThan(50);
    }
  }, 30_000);

  test("nomes e rótulos únicos", () => {
    expect(new Set(KEY_ICONS.map((i) => i.name)).size).toBe(KEY_ICONS.length);
    expect(new Set(KEY_ICONS.map((i) => i.label)).size).toBe(KEY_ICONS.length);
  });
});
