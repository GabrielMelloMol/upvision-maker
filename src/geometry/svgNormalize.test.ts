// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { svgToCrossSection } from "./svgImport";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const bounds = (svg: string) => scoped((k) => k(svgToCrossSection(M, svg)).bounds());
const area = (svg: string) => scoped((k) => k(svgToCrossSection(M, svg)).area());
const size = (svg: string) => {
  const b = bounds(svg);
  return [b.max[0] - b.min[0], b.max[1] - b.min[1]];
};
const RECT = `M10 10 H50 V20 H10 Z`; // 40 × 10

describe("a arte entra como no navegador (#183)", () => {
  test("transform por CSS (style e <style>) vale: girar 90° troca largura e altura", () => {
    const attr = size(`<svg ${NS}><g transform="rotate(90 30 15)"><path d="${RECT}"/></g></svg>`);
    expect(attr[0]).toBeCloseTo(10);
    expect(attr[1]).toBeCloseTo(40);
    const inline = size(`<svg ${NS}><path style="transform: rotate(90deg); transform-origin: 30px 15px" d="${RECT}"/></svg>`);
    const sheet = size(`<svg ${NS}><style>.g { transform: rotate(90deg); transform-origin: 30px 15px }</style><path class="g" d="${RECT}"/></svg>`);
    expect(inline[0]).toBeCloseTo(10);
    expect(inline[1]).toBeCloseTo(40); // antes: 40 × 10, o CSS era ignorado
    expect(sheet).toEqual(inline);
  });

  test("transform por CSS com unidades e funções: translate em px, scale, rotate em rad e turn, sem origem = canto 0 0", () => {
    const b = bounds(`<svg ${NS}><path style="transform: translate(100px, 50px) scale(2)" d="${RECT}"/></svg>`);
    expect([b.min[0], b.min[1], b.max[0], b.max[1]]).toEqual([120, 70, 200, 90]);
    const turn = size(`<svg ${NS}><path style="transform: rotate(0.25turn); transform-origin: 30px 15px" d="${RECT}"/></svg>`);
    expect(turn[0]).toBeCloseTo(10);
    const rad = size(`<svg ${NS}><path style="transform: rotate(1.5707963rad); transform-origin: 30px 15px" d="${RECT}"/></svg>`);
    expect(rad[0]).toBeCloseTo(10, 3);
  });

  test("<use href> (sem xlink:) funciona, com x e y", () => {
    const b = bounds(`<svg ${NS}><defs><path id="a" d="${RECT}"/></defs><use href="#a" x="100" y="0"/></svg>`);
    expect(b.min[0]).toBeCloseTo(110); // antes: "Nenhuma forma encontrada"
    expect(b.max[0]).toBeCloseTo(150);
  });

  test("<symbol viewBox> usado com largura e altura é escalado como no navegador", () => {
    // símbolo 0 0 40 10 (o retângulo) mostrado em 80 × 20 na posição (5, 7): dobra de tamanho
    const svg = `<svg ${NS}><symbol id="s" viewBox="10 10 40 10"><path d="${RECT}"/></symbol><use href="#s" x="5" y="7" width="80" height="20"/></svg>`;
    const b = bounds(svg);
    expect([b.min[0], b.min[1], b.max[0], b.max[1]]).toEqual([5, 7, 85, 27]); // antes: 40 × 10 em (10, 10)
    // proporção diferente: encaixa inteiro e centraliza (xMidYMid meet): 40×10 em 40×40 fica 40×10 no meio
    const meet = bounds(`<svg ${NS}><symbol id="s" viewBox="10 10 40 10"><path d="${RECT}"/></symbol><use href="#s" width="40" height="40"/></svg>`);
    expect(meet.min[1]).toBeCloseTo(15);
    expect(meet.max[1]).toBeCloseTo(25);
  });

  test("arco com rotação própria dentro de grupo girado e com escala desigual: caixa certa (conta com a matriz)", () => {
    // elipse rx 40, ry 15, girada 20° pelo próprio arco, num grupo rotate(30) scale(1 .5)
    const rx = 40, ry = 15, own = 20, g = 30, sy = 0.5;
    const r = (own * Math.PI) / 180, q = (g * Math.PI) / 180;
    const c = [Math.cos(r), Math.sin(r)];
    const p0 = [50 + rx * c[0], 50 + rx * c[1]], p1 = [50 - rx * c[0], 50 - rx * c[1]];
    const d = `M${p0[0]} ${p0[1]} A${rx} ${ry} ${own} 0 1 ${p1[0]} ${p1[1]} A${rx} ${ry} ${own} 0 1 ${p0[0]} ${p0[1]}Z`;
    const [w, h] = size(`<svg ${NS}><g transform="rotate(${g}) scale(1 ${sy})"><path d="${d}"/></g></svg>`);
    // matriz do grupo: R(30°) · S(1, .5); colunas da elipse: R(own) · diag(rx, ry)
    const m = [[Math.cos(q), -Math.sin(q) * sy], [Math.sin(q), Math.cos(q) * sy]];
    const e = [[Math.cos(r) * rx, -Math.sin(r) * ry], [Math.sin(r) * rx, Math.cos(r) * ry]];
    const a = [0, 1].map((i) => [0, 1].map((j) => m[i][0] * e[0][j] + m[i][1] * e[1][j]));
    expect(w / 2).toBeCloseTo(Math.hypot(a[0][0], a[0][1]), 0);
    expect(h / 2).toBeCloseTo(Math.hypot(a[1][0], a[1][1]), 0); // antes: largura e altura trocadas
  });

  test("círculo, elipse e retângulo arredondado giram e escalam como no navegador (área = π·rx·ry·|det|)", () => {
    expect(area(`<svg ${NS}><g transform="scale(2 .5)"><circle cx="50" cy="50" r="20"/></g></svg>`)).toBeCloseTo(Math.PI * 400, -1);
    expect(area(`<svg ${NS}><ellipse cx="50" cy="50" rx="30" ry="10" transform="rotate(35 50 50) scale(1 2)"/></svg>`)).toBeCloseTo(Math.PI * 30 * 10 * 2, -1);
    // retângulo 70 × 30 com cantos de 12: área = 70·30 − (4 − π)·12²
    expect(area(`<svg ${NS}><rect x="15" y="35" width="70" height="30" rx="12" transform="rotate(25 50 50)"/></svg>`)).toBeCloseTo(70 * 30 - (4 - Math.PI) * 144, -1);
  });

  test("nada que o app já lia muda: formas simples, evenodd e SVG sem arco dão a mesma área", () => {
    expect(area(`<svg ${NS}><path fill-rule="evenodd" d="M0 0H10V10H0Z M3 3H7V7H3Z"/></svg>`)).toBeCloseTo(84);
    expect(area(`<svg ${NS}><g transform="scale(2)"><rect x="0" y="0" width="5" height="5"/></g></svg>`)).toBeCloseTo(100);
  });

  test("SVG que não é XML bem formado continua dando o erro de antes, não quebra", () => {
    expect(() => svgToCrossSection(M, "isto não é svg")).toThrow();
  });
});
