// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { AIR_MM, CAL_Z, hatch, inside, orderStrokes, reach, withFill, PEN_DEFAULTS, penGcode, placeLines, type Stroke } from "./plotter";
import { svgLines } from "./svgImport";

const BED = { x: 256, y: 256 };
const pen = { ...PEN_DEFAULTS, airTest: false };
const square = { pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][], closed: true };
const zOf = (l: string) => Number(/Z(-?[\d.]+)/.exec(l)?.[1]);
const placeOnBed = (lines: { pts: [number, number][]; closed: boolean }[], w: number, x = 128, y = 128, rot = 0) => placeLines(lines, { x, y, w, rot }).strokes;

test("escala para a largura, centraliza na mesa e fecha o contorno", () => {
  const [s] = placeOnBed([square], 100);
  expect(s).toHaveLength(5);
  expect(s[0]).toEqual([78, 78]);
  expect(s[2]).toEqual([178, 178]);
  expect(s[4]).toEqual(s[0]);
});

test("desenho maior que a mesa fica fora da área (a tela avisa e não gera)", () => {
  expect(inside(placeOnBed([square], 250), reach(BED))).toBe(true);
  expect(inside(placeOnBed([square], 260), reach(BED))).toBe(false);
  expect(inside(placeOnBed([square], 100), reach({ x: 180, y: 90 }))).toBe(false);
});

test("camada girada 90° em volta do meio; traço em pé usa a largura como altura (#320)", () => {
  const [s] = placeOnBed([square], 10, 50, 50, 90);
  expect(s[0][0]).toBeCloseTo(55);
  expect(s[0][1]).toBeCloseTo(45);
  const { strokes, h } = placeLines([{ pts: [[0, 0], [0, 7]], closed: false }], { x: 20, y: 20, w: 14, rot: 0 });
  expect(strokes[0]).toEqual([[20, 13], [20, 27]]);
  expect(h).toBe(14);
  expect(() => placeLines([{ pts: [[1, 1], [1, 1]], closed: false }], { x: 0, y: 0, w: 10, rot: 0 })).toThrow(/tamanho/);
});

test("espelhar X/Y vira o desenho dentro da área; M84 no fim só se pedir; viagem na velocidade escolhida (#320)", () => {
  const st: Stroke[] = [[[10, 20], [30, 20]]];
  const plain = penGcode(st, pen, BED).gcode;
  expect(plain).toContain("G0 X10.00 Y20.00 F6000");
  expect(plain).not.toContain("M84");
  const g = penGcode(st, { ...pen, mirrorX: true, mirrorY: true, motorsOff: true, travelFeed: 9000 }, BED).gcode;
  expect(g).toContain("G0 X246.00 Y236.00 F9000");
  expect(g).toContain("G1 X226.00 Y236.00");
  expect(g).toContain("G0 X128.00 Y128.00 F9000 ; ponta"); // o meio continua no meio
  expect(g.trimEnd().split("\n").pop()).toMatch(/^M84/);
  expect(() => penGcode(st, { ...pen, travelFeed: 50 }, BED)).toThrow();
});

test("G-code: sem extrusão nem aquecimento, Z sobe antes de qualquer XY e tudo dentro da mesa", () => {
  const job = penGcode(orderStrokes(placeOnBed([square, { pts: [[20, 0], [30, 5]], closed: false }], 200)), pen, BED);
  const lines = job.gcode.split("\n").map((l) => l.replace(/;.*/, "").trim()).filter(Boolean);
  expect(lines.some((l) => /\bE-?\d/.test(l))).toBe(false);
  expect(lines.some((l) => /^M1(04|09|40|90)\b/.test(l))).toBe(false);
  const firstXY = lines.findIndex((l) => /\bX/.test(l));
  const firstZ = lines.findIndex((l) => /^G1 Z/.test(l));
  expect(firstZ).toBeGreaterThan(-1);
  expect(firstZ).toBeLessThan(firstXY);
  for (const l of lines) {
    const x = /X(-?[\d.]+)/.exec(l);
    const y = /Y(-?[\d.]+)/.exec(l);
    if (x) expect(Number(x[1])).toBeGreaterThanOrEqual(0);
    if (x) expect(Number(x[1])).toBeLessThanOrEqual(BED.x);
    if (y) expect(Number(y[1])).toBeGreaterThanOrEqual(0);
    if (y) expect(Number(y[1])).toBeLessThanOrEqual(BED.y);
  }
  // antes de cada viagem (G0) a caneta está no alto
  lines.forEach((l, i) => {
    if (!l.startsWith("G0")) return;
    const lastZ = lines.slice(0, i).reverse().find((p) => /^G1 Z/.test(p))!;
    expect(zOf(lastZ)).toBeGreaterThanOrEqual(pen.zLift);
  });
  expect(job.strokes).toBe(2);
  expect(job.lengthMm).toBeGreaterThan(0);
});

test("zera sem a caneta, para no meio da mesa a 5 mm e pausa até tocar Continuar, antes de desenhar", () => {
  const lines = penGcode(placeOnBed([square], 50), pen, BED).gcode.split("\n");
  const g28 = lines.findIndex((l) => l.startsWith("G28"));
  const pause = lines.findIndex((l) => l.startsWith("M400 U1"));
  expect(g28).toBeGreaterThan(-1);
  expect(pause).toBeGreaterThan(g28);
  expect(lines.slice(g28, pause).join("\n")).toContain(`G0 X128.00 Y128.00`);
  expect(zOf(lines[pause - 1])).toBe(CAL_Z);
  expect(lines.slice(0, pause).filter((l) => /^G1 X/.test(l))).toEqual([]); // nada desenhado antes da caneta
  expect(pen.zDraw).toBeLessThan(CAL_Z); // padrão: a caneta aperta um pouco o papel
});

test("testar no ar: depois da pausa a caneta nunca desce abaixo de Z de desenho + 10 mm", () => {
  const job = penGcode(placeOnBed([square], 50), { ...pen, airTest: true }, BED);
  const after = job.gcode.split("\n");
  const zs = after.slice(after.findIndex((l) => l.startsWith("M400 U1"))).filter((l) => /^G1 Z/.test(l)).map(zOf);
  expect(Math.min(...zs)).toBe(pen.zDraw + AIR_MM);
  expect(job.gcode).toContain("TESTE NO AR");
});

test("ponto fora da mesa e ajustes fora do limite não geram nada", () => {
  const outside: Stroke[] = [[[10, 10], [300, 10]]];
  expect(() => penGcode(outside, pen, BED)).toThrow(/não alcança/);
  expect(() => penGcode(placeOnBed([square], 50), { ...pen, zDraw: 8 }, BED)).toThrow();
  expect(() => penGcode(placeOnBed([square], 50), { ...pen, drawFeed: 99999 }, BED)).toThrow();
});

test("ordem: começa pela linha mais perto e inverte a linha quando a ponta de trás está mais perto", () => {
  const far: Stroke = [[100, 100], [110, 100]];
  const near: Stroke = [[50, 0], [1, 0]];
  const out = orderStrokes([far, near]);
  expect(out[0]).toEqual([[1, 0], [50, 0]]);
  expect(out[1]).toEqual(far);
});

test("SVG: traço aberto vira uma linha só, pelo meio", () => {
  const lines = svgLines('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10" stroke="black" fill="none"/><rect x="1" y="1" width="2" height="2"/></svg>');
  expect(lines).toHaveLength(2);
  expect(lines.find((l) => !l.closed)?.pts).toHaveLength(2);
});

test("deslocamento: o G-code move o bico (ponta − deslocamento), a pausa põe a ponta no meio do que ela alcança e nada sai da mesa", () => {
  const off = { ...pen, offX: -40, offY: 20 };
  const a = reach(BED, off);
  expect(a).toEqual({ x0: 0, y0: 20, x1: 216, y1: 256 });
  const strokes = placeOnBed([square], 100, 108, 138);
  expect(strokes[0][0]).toEqual([58, 88]); // centrado na área alcançada
  const lines = penGcode(strokes, off, BED).gcode.split("\n");
  expect(lines.find((l) => l.includes("ponta da caneta no meio"))).toContain("G0 X148.00 Y118.00");
  expect(lines.find((l) => l.startsWith("G0 X98.00 Y68.00"))).toBeTruthy(); // ponta (58, 88) → bico (98, 68)
  for (const l of lines) {
    const x = /X(-?[\d.]+)/.exec(l);
    const y = /Y(-?[\d.]+)/.exec(l);
    if (x) expect(Number(x[1])).toBeGreaterThanOrEqual(0);
    if (x) expect(Number(x[1])).toBeLessThanOrEqual(BED.x);
    if (y) expect(Number(y[1])).toBeGreaterThanOrEqual(0);
    if (y) expect(Number(y[1])).toBeLessThanOrEqual(BED.y);
  }
  expect(() => penGcode([[[230, 100], [240, 100]]], off, BED)).toThrow(/não alcança/); // fora da área da ponta
  expect(inside(placeOnBed([square], 240, 108, 138), a)).toBe(false);
  expect(() => penGcode(strokes, { ...pen, offX: 90 }, BED)).toThrow();
});

test("cabeçalho que a tela da Bambu lê, com o tempo estimado", () => {
  const g = penGcode(placeOnBed([square], 50), pen, BED).gcode;
  expect(g.startsWith("; HEADER_BLOCK_START")).toBe(true);
  expect(g).toMatch(/total estimated time: \d+m/);
});

const ring = (r: number, n = 64): Stroke => {
  const pts = Array.from({ length: n }, (_, i): [number, number] => [100 + r * Math.cos((2 * Math.PI * i) / n), 100 + r * Math.sin((2 * Math.PI * i) / n)]);
  return [...pts, pts[0]];
};

test("preenchimento: linhas paralelas só dentro da forma, furo vazio (par-ímpar), no ângulo e espaçamento pedidos", () => {
  const lines = hatch([ring(20), ring(10)], 1, 0);
  expect(lines.length).toBeGreaterThan(30);
  for (const [p, q] of lines) {
    expect(Math.abs(p[1] - q[1])).toBeLessThan(1e-9); // horizontais
    const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const r = Math.hypot(mid[0] - 100, mid[1] - 100);
    expect(r).toBeGreaterThan(9.5); // nada no furo
    expect(r).toBeLessThan(20.1);
  }
  const diag = hatch([ring(20)], 2, 45);
  for (const [p, q] of diag) expect(Math.abs(q[1] - p[1] - (q[0] - p[0]))).toBeLessThan(1e-6);
  expect(hatch([[[0, 0], [10, 0]]], 1, 0)).toEqual([]); // linha aberta não tem dentro
});

test("só contorno, contorno + preenchimento e só preenchimento (traço aberto continua)", () => {
  const shapes = [ring(20), [[0, 0], [10, 0]] as Stroke];
  const base = { spacing: 2, angle: 0 as const, cross: false };
  expect(withFill(shapes, { ...base, mode: "outline" })).toEqual(shapes);
  const both = withFill(shapes, { ...base, mode: "both" });
  const only = withFill(shapes, { ...base, mode: "fill" });
  expect(both.length).toBe(only.length + 1); // sem o contorno fechado
  expect(only).toContainEqual(shapes[1]);
  expect(withFill(shapes, { ...base, mode: "fill", cross: true }).length).toBeGreaterThan(only.length);
});

test("folha: centrada onde a caneta alcança; A4 numa mesa de 256 é cortada; desenho maior que a folha fica fora (#317)", async () => {
  const { drawArea, PAPER_DEFAULT } = await import("./plotter");
  const a5 = drawArea(BED, {}, PAPER_DEFAULT);
  expect(a5.sheet).toEqual({ x0: 54, y0: 23, x1: 202, y1: 233 });
  expect(a5.cut).toBe(false);
  const a4 = drawArea(BED, {}, { ...PAPER_DEFAULT, size: "a4" });
  expect(a4.cut).toBe(true);
  expect(a4.area).toEqual({ x0: 23, y0: 0, x1: 233, y1: 256 });
  expect(drawArea(BED, {}, { ...PAPER_DEFAULT, landscape: true }).sheet).toEqual({ x0: 23, y0: 54, x1: 233, y1: 202 });
  expect(drawArea(BED, {}, { ...PAPER_DEFAULT, size: "bed" }).sheet).toBeNull();
  // caneta 40 mm na frente: o meio da folha acompanha o meio de onde a caneta alcança
  const front = drawArea(BED, { offY: -40 }, PAPER_DEFAULT);
  expect((front.sheet!.y0 + front.sheet!.y1) / 2).toBe(108);
  expect(inside(placeOnBed([square], 150), a5.area)).toBe(false);
  expect(inside(placeOnBed([square], 100), a5.area)).toBe(true);
});
