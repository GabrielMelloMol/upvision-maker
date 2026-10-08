import { describe, expect, it } from "vitest";
import { getManifold } from "./manifold";
import { signedVolume } from "./heightfield";
import {
  COLOR_LAYER,
  DEFAULT_COLOR_LITHO,
  colorPreview,
  colorThickness,
  buildColorLithophane,
  inkAbsorbance,
  solveInks,
  transmitted,
  type ColorLithoParams,
} from "./lithophaneColor";

const P: ColorLithoParams = DEFAULT_COLOR_LITHO;
const rgba = (px: [number, number, number][]) => new Uint8ClampedArray(px.flatMap(([r, g, b]) => [r, g, b, 255]));

describe("modelo de transmissão da litofania colorida (#102)", () => {
  it("tinta mais grossa de TD maior precisa de mais espessura para o mesmo efeito", () => {
    const a = inkAbsorbance(P.inks.cyan.hex, 2);
    const b = inkAbsorbance(P.inks.cyan.hex, 4);
    expect(a[0]).toBeGreaterThan(b[0]);
  });

  it("branco não leva tinta e preto sai bem escuro com bastante preto", () => {
    const white = solveInks([255, 255, 255], P);
    expect(white.every((t) => t === 0)).toBe(true);
    const black = solveInks([0, 0, 0], P);
    expect(black[3]).toBeGreaterThan(0.5);
    expect(Math.max(...transmitted(black, P))).toBeLessThan(60);
  });

  it("amarelo claro usa o amarelo, quase sem ciano nem preto", () => {
    const [c, m, y, k] = solveInks([245, 225, 140], P);
    expect(y).toBeGreaterThan(c);
    expect(y).toBeGreaterThan(m);
    expect(k).toBeLessThan(0.1);
  });

  it("a cor prevista fica perto da cor pedida dentro do alcance das tintas", () => {
    for (const target of [[200, 120, 60], [90, 160, 90], [120, 120, 200]] as [number, number, number][]) {
      const t = solveInks(target, P);
      const out = transmitted(t, P);
      const lum = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      expect(Math.abs(lum(out) - lum(target))).toBeLessThan(45);
    }
  });

  it("espessuras saem em múltiplos da altura de camada e dentro do máximo", () => {
    const g = rgba([[255, 255, 255], [10, 10, 10], [200, 80, 40], [30, 90, 200]]);
    const t = colorThickness(g, 4, 1, P);
    for (const ink of t) for (const v of ink) {
      expect(Math.abs(v / COLOR_LAYER - Math.round(v / COLOR_LAYER))).toBeLessThan(1e-4);
      expect(v).toBeLessThanOrEqual(P.maxInk + 1e-6);
    }
  });

  it("a prévia contra a luz tem uma cor por ponto e o branco fica claro", () => {
    const g = rgba([[255, 255, 255], [0, 0, 0]]);
    const t = colorThickness(g, 2, 1, P);
    const img = colorPreview(t, 2, 1, P);
    expect(img.length).toBe(8);
    expect(img[0]).toBeGreaterThan(img[4] + 100);
  });
});

describe("peças da litofania colorida", () => {
  const cols = 28, rows = 20, cell = 0.5;
  const img = () => {
    const px: [number, number, number][] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) px.push([Math.round((x / cols) * 255), Math.round((y / rows) * 255), 160]);
    return rgba(px);
  };

  it("um volume por filamento (branco, ciano, magenta, amarelo, preto), sem sobreposição", async () => {
    const M = await getManifold();
    const out = buildColorLithophane(M, img(), cols, rows, cell, P);
    const parts = out.model.parts;
    expect(parts.map((p) => p.color).length).toBe(new Set(parts.map((p) => p.color)).size);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts[0].name).toBe("Branco");
    for (const p of parts) expect(signedVolume(p.mesh)).toBeGreaterThan(0);
  }, 30_000);

  it("o branco de difusão cobre toda a foto e a moldura é inteiriça", async () => {
    const M = await getManifold();
    const out = buildColorLithophane(M, img(), cols, rows, cell, { ...P, border: 3 });
    const white = out.model.parts[0].mesh;
    const xs = Array.from({ length: white.positions.length / 3 }, (_, i) => white.positions[i * 3]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo((cols - 1) * cell, 1);
  }, 30_000);

  it("avisa que precisa de 5 filamentos e de filamentos translúcidos", async () => {
    const M = await getManifold();
    const out = buildColorLithophane(M, img(), cols, rows, cell, P);
    expect(out.warnings.join(" ")).toMatch(/5 filamentos/);
    expect(out.warnings.join(" ")).toMatch(/transl/i);
  }, 30_000);

  it("sem TD cadastrado avisa que usou valores típicos; com TD não avisa", async () => {
    const M = await getManifold();
    const typical = buildColorLithophane(M, img(), cols, rows, cell, P);
    expect(typical.warnings.join(" ")).toMatch(/TD/);
    const known = { ...P, inks: { ...P.inks, cyan: { ...P.inks.cyan, known: true }, magenta: { ...P.inks.magenta, known: true }, yellow: { ...P.inks.yellow, known: true }, black: { ...P.inks.black, known: true } } };
    expect(buildColorLithophane(M, img(), cols, rows, cell, known).warnings.join(" ")).not.toMatch(/TD/);
  }, 30_000);
});
