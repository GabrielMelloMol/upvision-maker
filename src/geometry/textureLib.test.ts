import { describe, expect, test } from "vitest";
import { TEXTURES, thumbnail, textureById } from "./textureLib";

describe("texturas (#222)", () => {
  test("são 16, com nome em português e escala padrão positiva", () => {
    expect(TEXTURES).toHaveLength(16);
    expect(new Set(TEXTURES.map((t) => t.id)).size).toBe(16);
    for (const t of TEXTURES) {
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.scale).toBeGreaterThan(0);
    }
  });

  test.each(TEXTURES.map((t) => t.id))("%s: altura sempre entre 0 e 1, determinística e com variação de verdade", (id) => {
    const t = textureById(id);
    const vals: number[] = [];
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) vals.push(t.fn(i / 40 * 2.3, j / 40 * 2.3));
    expect(vals.every((v) => Number.isFinite(v) && v >= -1e-9 && v <= 1 + 1e-9)).toBe(true);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.25); // não é uma textura chapada
    expect(t.fn(0.123, 0.456)).toBe(t.fn(0.123, 0.456));
  });

  test("miniatura tem o tamanho certo e não é toda da mesma cor", () => {
    const px = thumbnail("carbono", 32);
    expect(px).toHaveLength(32 * 32 * 4);
    expect(new Set([...px].filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(4);
  });
});
