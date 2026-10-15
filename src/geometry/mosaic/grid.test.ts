import { describe, expect, test } from "vitest";
import { DESIGNS } from "./designs";
import { blankGrid, cellAt, colorsUsed, countCells, gridFromImage, KIT_COLORS, paintCell, parseDesign, partsOf, roundCorners } from "./grid";

describe("desenho", () => {
  test("lê o texto: cor, formato e giro", () => {
    const g = parseDesign([".. r# b2", "wo kA .."]);
    expect([g.cols, g.rows]).toEqual([3, 2]);
    expect(g.cells[0]).toBeNull();
    expect(g.cells[1]).toEqual({ color: "red", shape: "square", rot: 0 });
    expect(g.cells[2]).toEqual({ color: "blue", shape: "quarter", rot: 1 });
    expect(g.cells[3]).toEqual({ color: "white", shape: "circle", rot: 0 });
    expect(g.cells[4]).toEqual({ color: "black", shape: "triangle", rot: 0 });
  });

  test("recusa linha torta e casa desconhecida", () => {
    expect(() => parseDesign(["r# r#", "r#"])).toThrow(/tamanho diferente/);
    expect(() => parseDesign(["z#"])).toThrow(/desconhecida/);
  });

  test("os desenhos prontos são grades 8×8 com cores do kit e ao menos 12 peças", () => {
    expect(DESIGNS.length).toBeGreaterThanOrEqual(10);
    const keys = new Set(KIT_COLORS.map((c) => c.key));
    for (const d of DESIGNS) {
      expect([d.grid.cols, d.grid.rows]).toEqual([8, 8]);
      expect(countCells(d.grid)).toBeGreaterThanOrEqual(12);
      for (const c of d.grid.cells) if (c) expect(keys.has(c.color)).toBe(true);
    }
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(DESIGNS.length);
  });

  test("a lista de peças soma o desenho e o olho conta como branco", () => {
    const g = DESIGNS.find((d) => d.id === "frog")!.grid;
    const parts = partsOf(g, KIT_COLORS);
    expect(parts.reduce((n, p) => n + p.n, 0)).toBe(countCells(g));
    expect(parts.find((p) => p.shape === "eye")).toMatchObject({ n: 2, color: { key: "white" } });
    expect(colorsUsed(g, KIT_COLORS).map((c) => c.key)).toEqual(["red", "green", "white"]);
  });

  test("pintar devolve uma grade nova, ou a mesma se nada muda", () => {
    const g = blankGrid(3, 3);
    const a = paintCell(g, 1, 1, { color: "red", shape: "square", rot: 0 });
    expect(a).not.toBe(g);
    expect(cellAt(g, 1, 1)).toBeNull();
    expect(cellAt(a, 1, 1)?.color).toBe("red");
    expect(paintCell(a, 1, 1, { color: "red", shape: "square", rot: 0 })).toBe(a);
    expect(paintCell(a, 9, 9, null)).toBe(a);
    expect(cellAt(paintCell(a, 1, 1, null), 1, 1)).toBeNull();
  });
});

describe("cantos", () => {
  const sq = parseDesign([".. .. .. ..", ".. r# r# ..", ".. r# r# ..", ".. .. .. .."]);

  test("os quatro cantos de fora viram quarto de círculo com a curva para fora", () => {
    const g = roundCorners(sq, "quarter");
    expect(cellAt(g, 1, 1)).toMatchObject({ shape: "quarter", rot: 1 }); // NW
    expect(cellAt(g, 2, 1)).toMatchObject({ shape: "quarter", rot: 0 }); // NE
    expect(cellAt(g, 1, 2)).toMatchObject({ shape: "quarter", rot: 2 }); // SW
    expect(cellAt(g, 2, 2)).toMatchObject({ shape: "quarter", rot: 3 }); // SE
  });

  test("triângulo no lugar do quarto, e 'none' não mexe", () => {
    expect(cellAt(roundCorners(sq, "triangle"), 1, 1)?.shape).toBe("triangle");
    expect(roundCorners(sq, "none")).toBe(sq);
  });

  test("casa do meio de uma lateral ou com vizinhos dos dois lados não vira canto", () => {
    const g = roundCorners(parseDesign([".. .. ..", "r# r# r#", ".. .. .."]), "quarter");
    expect(cellAt(g, 1, 1)?.shape).toBe("square");
    expect(cellAt(g, 0, 1)?.shape).toBe("square");
  });
});

describe("imagem para mosaico", () => {
  /** 16×16: metade de cima vermelha, a de baixo azul, com um canto transparente. */
  function image(): Uint8ClampedArray {
    const px = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const o = (y * 16 + x) * 4;
        const [r, g, b] = y < 8 ? [214, 40, 40] : [37, 99, 235];
        px.set(x < 2 && y < 2 ? [0, 0, 0, 0] : [r, g, b, 255], o);
      }
    return px;
  }

  test("usa só as cores do kit e deixa o transparente vazio", () => {
    const kit = KIT_COLORS.filter((c) => ["red", "blue", "white", "black"].includes(c.key));
    const g = gridFromImage(image(), 16, 16, 8, kit, "none");
    expect([g.cols, g.rows]).toEqual([8, 8]);
    expect(new Set(g.cells.flatMap((c) => (c ? [c.color] : [])))).toEqual(new Set(["red", "blue"]));
    expect(g.cells[0]).toBeNull();
    expect(cellAt(g, 4, 1)?.color).toBe("red");
    expect(cellAt(g, 4, 6)?.color).toBe("blue");
    expect(g.cells.every((c) => !c || c.shape === "square")).toBe(true);
  });

  test("com cantos redondos, os cantos de fora viram quarto de círculo", () => {
    const kit = KIT_COLORS.filter((c) => ["red", "blue"].includes(c.key));
    const g = gridFromImage(image(), 16, 16, 8, kit, "quarter");
    expect(g.cells.some((c) => c?.shape === "quarter")).toBe(true);
  });
});
