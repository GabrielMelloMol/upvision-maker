import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { buildPixelArt, DEFAULT_PIXEL_OPTIONS as O, paint, pixelate, replaceColor, type PixelGrid } from "./pixelArt";
import { volume } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([0.6 * h * s.length, h], true) : null);
// 3×2: vermelho, azul, vazio / azul, azul, vermelho
const G: PixelGrid = { cols: 3, rows: 2, cells: [0, 1, -1, 1, 1, 0], palette: ["#ff0000", "#0000ff"] };

describe("pixelate", () => {
  test("imagem vira grade N×M na proporção, com as cores trocadas pelos filamentos e o transparente vazio", () => {
    // 40×20: metade esquerda vermelha, direita azul, e a última coluna transparente
    const w = 40, h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba.set(x < 20 ? [250, 10, 10, 255] : [10, 10, 240, x >= 36 ? 0 : 255], i);
      }
    const g = pixelate(rgba, w, h, 10, 4, ["#ee1111", "#1111dd", "#ffffff"]);
    expect([g.cols, g.rows]).toEqual([10, 5]);
    expect(g.palette.slice().sort()).toEqual(["#1111dd", "#ee1111"]);
    const at = (c: number, r: number) => g.palette[g.cells[r * g.cols + c]];
    expect(at(0, 0)).toBe("#ee1111");
    expect(at(8, 4)).toBe("#1111dd");
    expect(g.cells[9]).toBe(-1);
  });

  test("um pixel sozinho (o olho do desenho) não some", () => {
    const w = 8, h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set(i === 27 ? [0, 0, 0, 255] : [255, 255, 0, 255], i * 4);
    const g = pixelate(rgba, w, h, 8, 2);
    expect(g.cells[27]).not.toBe(g.cells[0]);
  });
});

test("editor: pintar, apagar e trocar uma cor por outra devolvem grades novas", () => {
  const a = paint(G, 2, 0, 0);
  expect(a.cells[2]).toBe(0);
  expect(G.cells[2]).toBe(-1);
  expect(paint(G, 0, 0, -1).cells[0]).toBe(-1);
  const b = replaceColor(G, 1, "#00ff00");
  expect(b.palette).toEqual(["#ff0000", "#00ff00"]);
  // trocar por uma cor que já existe junta as duas
  const c = replaceColor(G, 1, "#ff0000");
  expect(c.palette).toEqual(["#ff0000"]);
  expect(c.cells).toEqual([0, 0, -1, 0, 0, 0]);
});

describe("buildPixelArt", { timeout: 60_000 }, () => {
  test("mosaico: base no formato do desenho e uma parte por cor em cima", () => {
    const out = buildPixelArt(M, G, { ...O, output: "mosaic", pixel: 5, border: 0, base: 1, relief: 1 }, text);
    expect(out.models).toHaveLength(1);
    const parts = out.models[0].parts;
    expect(parts.map((p) => p.color)).toEqual([O.baseColor, "#ff0000", "#0000ff"]);
    expect(volume(parts[1].mesh)).toBeCloseTo(2 * 25, 0);
    expect(volume(parts[2].mesh)).toBeCloseTo(3 * 25, 0);
    expect(volume(parts[0].mesh)).toBeCloseTo(5 * 25, 0); // 5 casas cheias × 1 mm
    expect(meshBounds([parts[1].mesh])!.min[2]).toBeCloseTo(1, 2);
  });

  test("ímã: furo embaixo e base grossa o bastante", () => {
    const g: PixelGrid = { cols: 4, rows: 4, cells: Array(16).fill(0), palette: ["#ff0000"] };
    const plain = buildPixelArt(M, g, { ...O, output: "mosaic", pixel: 8, base: 4 }, text);
    const mag = buildPixelArt(M, g, { ...O, output: "magnet", pixel: 8, border: 0, base: 1, magnetD: 10, magnetH: 3 }, text);
    const baseOf = (o: typeof mag) => o.models[0].parts[0].mesh;
    expect(meshBounds([baseOf(mag)])!.max[2]).toBeGreaterThanOrEqual(3 + 0.2 + 0.8 - 0.01);
    const hole = Math.PI * 5.15 ** 2 * 3.2;
    const full = 32 * 32 * meshBounds([baseOf(mag)])!.max[2];
    expect((full - volume(baseOf(mag))) / hole).toBeGreaterThan(0.95);
    expect(plain.models[0].parts[0]).toBeDefined();
  });

  test("quebra-cabeça: bandeja com encaixe no formato do desenho e um modelo de pixels soltos por cor, com folga", () => {
    const out = buildPixelArt(M, G, { ...O, output: "puzzle", pixel: 8, clearance: 0.2, marks: "number" }, text);
    const names = out.models.map((m) => m.name);
    expect(names[0]).toBe("Bandeja");
    expect(names.slice(1)).toEqual(["Pixels cor 1 (2)", "Pixels cor 2 (3)"]);
    const tiles = out.models[1].parts[0].mesh;
    const tile = 7.8 * 7.8 * (O.pocket + O.tileExtra);
    expect(volume(tiles) / (2 * tile)).toBeCloseTo(1, 1);
    // números gravados no fundo de cada casa
    const noMarks = buildPixelArt(M, G, { ...O, output: "puzzle", pixel: 8, marks: "none" }, text);
    expect(volume(out.models[0].parts[0].mesh)).toBeLessThan(volume(noMarks.models[0].parts[0].mesh));
  });

  test("quebra-cabeça com marca de cor: quadradinho da cor embutido no fundo da casa", () => {
    const out = buildPixelArt(M, G, { ...O, output: "puzzle", pixel: 8, marks: "color" }, text);
    expect(out.models[0].parts.map((p) => p.color)).toEqual([O.baseColor, "#ff0000", "#0000ff"]);
  });

  test("avisa quando passa da mesa", () => {
    const g: PixelGrid = { cols: 64, rows: 2, cells: Array(128).fill(0), palette: ["#ff0000"] };
    expect(buildPixelArt(M, g, { ...O, output: "mosaic", pixel: 5 }, text).warnings.join(" ")).toMatch(/mesa/);
  });
});
