import { beforeAll, describe, expect, test } from "vitest";
import { solidFromMesh } from "../cutSolid";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { meshBounds } from "../bounds";
import { modelSize, modelVolume, volume } from "../testUtil";
import type { Mesh } from "../types";
import { buildBoard } from "./board";
import { DEFAULT_BOARD, DEFAULT_COUNTS, DEFAULT_PIECE, DEFAULT_POT, boardSize, pieceSide, pocketSide } from "./params";
import { buildPieces, pieceList, pieceMeshes, plateCapacity, type MosaicColor } from "./pieces";
import { buildPot, compartmentVolume, compartments, rectGrid } from "./pot";
import { placedOutline, shapeArea, shapeOutline, type MosaicShape } from "./shapes";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const RED: MosaicColor = { key: "red", label: "Vermelho", hex: "#d62828" };
const BLUE: MosaicColor = { key: "blue", label: "Azul", hex: "#1d4ed8" };
const WHITE: MosaicColor = { key: "white", label: "Branco", hex: "#f8f8f6" };
const BLACK: MosaicColor = { key: "black", label: "Preto", hex: "#1c1c1e" };
const ALL: MosaicShape[] = ["square", "half", "quarter", "triangle", "circle", "eye"];

/** Sólido manifold da malha; o teste confere que é fechada. */
function manifoldOf(m: Mesh) {
  const { solid, holes } = solidFromMesh(M, m);
  expect(holes).toBe(0);
  return solid;
}

describe("formatos", () => {
  test.each(ALL)("%s cabe dentro da casa quadrada", (shape) => {
    const s = 17.9;
    for (const [x, y] of shapeOutline(shape, s)) {
      expect(Math.abs(x)).toBeLessThanOrEqual(s / 2 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(s / 2 + 1e-9);
    }
  });

  test.each(ALL)("%s: o contorno gira em passos de 90° sem sair da casa e a área não muda", (shape) => {
    const s = 10;
    const area = (pts: [number, number][]) => Math.abs(pts.reduce((a, p, i) => a + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0) / 2);
    for (const rot of [0, 1, 2, 3]) {
      const pts = placedOutline(shape, rot, s);
      expect(area(pts)).toBeCloseTo(area(shapeOutline(shape, s)), 6);
      for (const [x, y] of pts) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(s / 2 + 1e-9);
    }
  });

  test("as áreas seguem a geometria (quadrado, triângulo, quarto, meio, disco)", () => {
    expect(shapeArea("square", 10)).toBe(100);
    expect(shapeArea("triangle", 10)).toBe(50);
    expect(shapeArea("quarter", 10)).toBeCloseTo(78.54, 1);
    expect(shapeArea("half", 10)).toBeCloseTo(39.27, 1);
    expect(shapeArea("circle", 10)).toBeCloseTo(78.54, 1);
  });
});

describe("tabuleiro", () => {
  test("é uma malha fechada, deitada na mesa, com as medidas da grade", () => {
    const { model, warnings } = buildBoard(M, DEFAULT_BOARD);
    const [W, H] = boardSize(DEFAULT_BOARD);
    const [sx, sy, sz] = modelSize(model);
    expect(sx).toBeCloseTo(W, 2);
    expect(sy).toBeCloseTo(H, 2);
    expect(sz).toBeCloseTo(DEFAULT_BOARD.floor + DEFAULT_BOARD.depth, 3);
    expect(meshBounds([model.parts[0].mesh])!.min[2]).toBeCloseTo(0, 6);
    manifoldOf(model.parts[0].mesh).delete();
    expect(warnings).toEqual([]);
  });

  test("o volume é a placa menos as casas rebaixadas", () => {
    const b = { ...DEFAULT_BOARD, cols: 4, rows: 3, corner: 0 };
    const { model } = buildBoard(M, b);
    const [W, H] = boardSize(b);
    const expected = W * H * (b.floor + b.depth) - b.cols * b.rows * pocketSide(b) ** 2 * b.depth;
    expect(modelVolume(model)).toBeCloseTo(expected, 0);
  });

  test("uma peça quadrada cabe em cada casa com a folga pedida, e a de cima passa da borda", () => {
    const b = DEFAULT_BOARD;
    const board = manifoldOf(buildBoard(M, b).model.parts[0].mesh);
    const { main } = pieceMeshes(M, b, DEFAULT_PIECE, "square");
    const piece = manifoldOf({ ...main, positions: main.positions.map((v, i) => (i % 3 === 2 ? v + b.floor : v)) });
    // a peça no lugar de uma casa (a do canto) não toca o tabuleiro: só a folga separa
    const x0 = -((b.cols - 1) * b.cell) / 2, y0 = ((b.rows - 1) * b.cell) / 2;
    const moved = piece.translate([x0, y0, 0]);
    expect(board.intersect(moved).volume()).toBeCloseTo(0, 3);
    // e a folga é a do parâmetro: encosta com um tanto de folga a menos
    const tight = piece.scale([(pieceSide(b) + 2 * b.clearance + 0.2) / pieceSide(b), (pieceSide(b) + 2 * b.clearance + 0.2) / pieceSide(b), 1]).translate([x0, y0, 0]);
    expect(board.intersect(tight).volume()).toBeGreaterThan(0.1);
    const topOfRib = b.floor + b.depth;
    expect(b.floor + DEFAULT_PIECE.height).toBeGreaterThan(topOfRib);
    [board, piece, moved, tight].forEach((s) => s.delete());
  });

  test("cauda de andorinha: o tabuleiro da direita encaixa sem encostar, e o de cima também", () => {
    const b = { ...DEFAULT_BOARD, join: "dovetail" as const };
    const { model, warnings } = buildBoard(M, b);
    expect(warnings).toEqual([]);
    const [W, H] = boardSize(b);
    const a = manifoldOf(model.parts[0].mesh);
    const right = a.translate([W, 0, 0]);
    const below = a.translate([0, -H, 0]);
    expect(a.intersect(right).volume()).toBeCloseTo(0, 3);
    expect(a.intersect(below).volume()).toBeCloseTo(0, 3);
    // e as caudas entram de verdade: a união deixa menos vão que dois tabuleiros soltos (a cauda ocupa o vão do outro)
    const vol = a.volume();
    const joined = a.add(right).volume();
    expect(joined).toBeCloseTo(2 * vol, 3);
    const tabArea = a.add(right).getMesh();
    expect(tabArea.triVerts.length).toBeGreaterThan(0);
    [a, right, below].forEach((s) => s.delete());
  });

  test("sem borda para o encaixe, ele é desligado com aviso", () => {
    const { warnings, model } = buildBoard(M, { ...DEFAULT_BOARD, join: "dovetail", border: 3 });
    expect(warnings.join(" ")).toMatch(/borda precisa/);
    expect(modelSize(model)[0]).toBeCloseTo(boardSize({ ...DEFAULT_BOARD, border: 3 })[0], 2);
  });

  test("avisa quando passa da mesa", () => {
    expect(buildBoard(M, { ...DEFAULT_BOARD, cols: 14, cell: 24 }).warnings.join(" ")).toMatch(/passa da mesa/);
  });
});

describe("peças", () => {
  test.each(ALL)("%s: malha fechada, apoiada na mesa, dentro da casa", (shape) => {
    const b = DEFAULT_BOARD;
    const { main, pupil } = pieceMeshes(M, b, DEFAULT_PIECE, shape);
    const bb = meshBounds([main])!;
    expect(bb.min[2]).toBeCloseTo(0, 6);
    expect(bb.max[2]).toBeCloseTo(DEFAULT_PIECE.height, 3);
    const half = pieceSide(b) / 2 + 1e-3;
    expect(Math.max(...bb.min.slice(0, 2).map(Math.abs), ...bb.max.slice(0, 2).map(Math.abs))).toBeLessThanOrEqual(half);
    manifoldOf(main).delete();
    expect(!!pupil).toBe(shape === "eye");
    if (pupil) manifoldOf(pupil).delete();
  });

  test("o quadrado mede o lado da peça embaixo e tem a borda de cima chanfrada", () => {
    const b = DEFAULT_BOARD;
    const { main } = pieceMeshes(M, b, DEFAULT_PIECE, "square");
    const side = pieceSide(b);
    expect(modelSize({ name: "x", parts: [{ name: "x", color: "#000", mesh: main }] })[0]).toBeCloseTo(side, 3);
    // no topo a peça é menor que na base (chanfro): o corte rente ao topo tem menos área que o do meio
    const top = Array.from({ length: main.positions.length / 3 }, (_, i) => i).filter((i) => main.positions[i * 3 + 2] > DEFAULT_PIECE.height - 1e-6);
    const xs = top.map((i) => main.positions[i * 3]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(side - 2 * DEFAULT_PIECE.chamfer, 2);
  });

  test("o olho tem o furo da pupila e a pupila enche o furo (só uma folga mínima)", () => {
    const { main, pupil } = pieceMeshes(M, DEFAULT_BOARD, DEFAULT_PIECE, "eye");
    const circle = pieceMeshes(M, DEFAULT_BOARD, DEFAULT_PIECE, "circle").main;
    const hole = volume(circle) - volume(main);
    expect(hole).toBeGreaterThan(volume(pupil!));
    expect(hole - volume(pupil!)).toBeLessThan(hole * 0.2);
  });

  test("uma mesa cheia por cor: quantidade, mesas e nomes", () => {
    const counts = { ...DEFAULT_COUNTS, eye: 0 };
    const items = pieceList([RED, BLUE], counts, null);
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, items, { layout: "color", fill: false, pupil: BLACK });
    const perColor = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(out.count).toBe(2 * perColor);
    expect(out.models.map((m) => m.name)).toEqual(["Vermelho · mesa 1", "Azul · mesa 1"]);
    out.models.forEach((m) => expect(m.parts).toHaveLength(1));
    expect(out.models[0].parts[0].color).toBe(RED.hex);
  });

  test("multicor: uma mesa com várias cores, uma parte por cor", () => {
    const items = pieceList([RED, BLUE], { ...DEFAULT_COUNTS, eye: 0 }, null);
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, items, { layout: "mixed", fill: false, pupil: BLACK });
    expect(out.models).toHaveLength(1);
    expect(out.models[0].parts.map((p) => p.color)).toEqual([RED.hex, BLUE.hex]);
  });

  test("as peças da mesa não se tocam e ficam dentro da mesa", () => {
    const { total } = plateCapacity(DEFAULT_BOARD);
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, [{ shape: "square", color: RED, n: total }], { layout: "color", fill: false, pupil: BLACK });
    expect(out.models).toHaveLength(1);
    const mesh = out.models[0].parts[0].mesh;
    const b = meshBounds([mesh])!;
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(256);
    const s = manifoldOf(mesh);
    expect(s.decompose()).toHaveLength(total);
    expect(s.volume()).toBeCloseTo(total * volume(pieceMeshes(M, DEFAULT_BOARD, DEFAULT_PIECE, "square").main), 1);
    s.delete();
  });

  test("passou de uma mesa: mais de um modelo, lado a lado, com aviso", () => {
    const { total } = plateCapacity(DEFAULT_BOARD);
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, [{ shape: "square", color: RED, n: total + 3 }], { layout: "color", fill: false, pupil: BLACK });
    expect(out.platesN).toBe(2);
    expect(out.models.map((m) => m.name)).toEqual(["Vermelho · mesa 1", "Vermelho · mesa 2"]);
    expect(out.warnings.join(" ")).toMatch(/2 mesas/);
    const [a, b] = out.models.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    expect(b.min[0]).toBeGreaterThan(a.max[0]);
  });

  test("completar a mesa acrescenta só quadrados, e conta como extra", () => {
    const { total } = plateCapacity(DEFAULT_BOARD);
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, [{ shape: "circle", color: RED, n: 10 }], { layout: "color", fill: true, pupil: BLACK });
    expect(out.extra).toBe(total - 10);
    expect(out.count).toBe(10);
    expect(out.models).toHaveLength(1);
    expect(manifoldOf(out.models[0].parts[0].mesh).decompose()).toHaveLength(total);
  });

  test("olho: o branco leva o furo e a pupila vai numa parte preta", () => {
    const out = buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, pieceList([], DEFAULT_COUNTS, WHITE), { layout: "color", fill: false, pupil: BLACK });
    expect(out.models[0].parts.map((p) => p.color)).toEqual([WHITE.hex, BLACK.hex]);
    expect(out.count).toBe(DEFAULT_COUNTS.eye);
  });

  test("sem peças, nada", () => {
    expect(buildPieces(M, DEFAULT_BOARD, DEFAULT_PIECE, [], { layout: "color", fill: true, pupil: BLACK }).models).toEqual([]);
  });
});

describe("pote", () => {
  test("redondo com 6 divisórias: malha fechada, tampa que cobre por fora com folga", () => {
    const { models, warnings } = buildPot(M, DEFAULT_POT, 6);
    expect(warnings).toEqual([]);
    expect(models.map((m) => m.name)).toEqual(["Pote", "Tampa"]);
    const pot = manifoldOf(models[0].parts[0].mesh);
    const lid = manifoldOf(models[1].parts[0].mesh);
    expect(modelSize(models[0])[0]).toBeCloseTo(DEFAULT_POT.w, 1);
    expect(modelSize(models[0])[2]).toBeCloseTo(DEFAULT_POT.height, 3);
    // a tampa de volta ao lugar: a saia desce por fora do pote sem encostar
    const flipped = lid.mirror([0, 0, 1]).translate([0, 0, DEFAULT_POT.height + 1.8]);
    expect(pot.intersect(flipped).volume()).toBeCloseTo(0, 3);
    [pot, lid, flipped].forEach((s) => s.delete());
  });

  test("a divisória é uma parede de fato: mais divisórias, mais volume de pote e menos volume útil", () => {
    const v = (n: number) => modelVolume(buildPot(M, { ...DEFAULT_POT, lid: false }, n).models[0]);
    expect(v(2)).toBeGreaterThan(v(1));
    expect(v(6)).toBeGreaterThan(v(2));
    expect(compartmentVolume(DEFAULT_POT, 6)).toBeCloseTo(compartmentVolume(DEFAULT_POT, 3) / 2, 3);
    expect(compartments(DEFAULT_POT, 6)).toBe(6);
  });

  test("retangular: grade de divisórias com pelo menos uma casa por cor", () => {
    const p = { ...DEFAULT_POT, shape: "rect" as const, w: 150, d: 100 };
    expect(rectGrid(6, 150, 100)).toEqual([3, 2]);
    expect(compartments(p, 5)).toBeGreaterThanOrEqual(5);
    const { models } = buildPot(M, p, 6);
    manifoldOf(models[0].parts[0].mesh).delete();
    expect(modelSize(models[0])[0]).toBeCloseTo(150, 1);
    expect(modelSize(models[0])[1]).toBeCloseTo(100, 1);
  });

  test("avisa pote maior que a mesa e divisórias estreitas demais", () => {
    expect(buildPot(M, { ...DEFAULT_POT, w: 300 }, 6).warnings.join(" ")).toMatch(/passa da mesa/);
    expect(buildPot(M, { ...DEFAULT_POT, w: 70 }, 9).warnings.join(" ")).toMatch(/estreita/);
  });

  test("sem tampa, só o pote", () => {
    expect(buildPot(M, { ...DEFAULT_POT, lid: false }, 4).models).toHaveLength(1);
  });
});
