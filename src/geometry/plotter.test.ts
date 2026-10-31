// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { AIR_MM, orderStrokes, PEN_DEFAULTS, penGcode, placeOnBed, type Stroke } from "./plotter";
import { svgLines } from "./svgImport";

const BED = { x: 256, y: 256 };
const pen = { ...PEN_DEFAULTS, airTest: false };
const square = { pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][], closed: true };
const zOf = (l: string) => Number(/Z(-?[\d.]+)/.exec(l)?.[1]);

test("escala para a largura, centraliza na mesa e fecha o contorno", () => {
  const [s] = placeOnBed([square], 100, BED);
  expect(s).toHaveLength(5);
  expect(s[0]).toEqual([78, 78]);
  expect(s[2]).toEqual([178, 178]);
  expect(s[4]).toEqual(s[0]);
});

test("desenho maior que a mesa (com margem) dá erro em vez de sair da mesa", () => {
  expect(() => placeOnBed([square], 250, BED)).toThrow(/não cabe/);
  expect(() => placeOnBed([square], 100, { x: 180, y: 90 })).toThrow(/não cabe/);
});

test("G-code: sem extrusão nem aquecimento, Z sobe antes de qualquer XY e tudo dentro da mesa", () => {
  const job = penGcode(orderStrokes(placeOnBed([square, { pts: [[20, 0], [30, 5]], closed: false }], 200, BED)), pen, BED);
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

test("testar no ar: a caneta nunca desce abaixo de Z de desenho + 10 mm", () => {
  const job = penGcode(placeOnBed([square], 50, BED), { ...pen, airTest: true }, BED);
  const zs = job.gcode.split("\n").filter((l) => /^G1 Z/.test(l)).map(zOf);
  expect(Math.min(...zs)).toBe(pen.zDraw + AIR_MM);
  expect(job.gcode).toContain("TESTE NO AR");
});

test("ponto fora da mesa e ajustes fora do limite não geram nada", () => {
  const outside: Stroke[] = [[[10, 10], [300, 10]]];
  expect(() => penGcode(outside, pen, BED)).toThrow(/fora da mesa/);
  expect(() => penGcode(placeOnBed([square], 50, BED), { ...pen, zDraw: 8, zLift: 8 }, BED)).toThrow();
  expect(() => penGcode(placeOnBed([square], 50, BED), { ...pen, drawFeed: 99999 }, BED)).toThrow();
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
