import { describe, expect, test } from "vitest";
import { BG, hexToRgb, matchPalette, quantize, rgbToLab, stackedMasks } from "./palette";
import { loadFixture, synthImage, type SynthShape } from "./testFixtures";

const W = 160;
const H = 120;
const WHITE = "#ffffff";
const RED = "#d6262e", BLUE = "#2563eb", YELLOW = "#facc15", BLACK = "#1c1c1e", GREEN = "#22a04b", PINK = "#f472b6";

type Case = { name: string; bg: string; shapes: SynthShape[]; colors: number; noise?: number; removeBg?: boolean };

// banco de regressão (#8): logos chapados de 2–4 cores, com serrilhado, ruído de JPEG, cores próximas e fundo colorido
const BANK: Case[] = [
  { name: "círculo vermelho", bg: WHITE, colors: 1, shapes: [{ kind: "circle", cx: 80, cy: 60, r: 40, color: RED }] },
  { name: "alvo 2 cores", bg: WHITE, colors: 2, shapes: [{ kind: "circle", cx: 80, cy: 60, r: 50, color: BLUE }, { kind: "circle", cx: 80, cy: 60, r: 25, color: YELLOW }] },
  { name: "alvo 3 cores", bg: WHITE, colors: 3, shapes: [{ kind: "circle", cx: 80, cy: 60, r: 55, color: RED }, { kind: "circle", cx: 80, cy: 60, r: 38, color: BLACK }, { kind: "circle", cx: 80, cy: 60, r: 20, color: YELLOW }] },
  { name: "bandeira 3 faixas", bg: WHITE, colors: 3, shapes: [{ kind: "rect", x: 10, y: 10, w: 45, h: 100, color: GREEN }, { kind: "rect", x: 55, y: 10, w: 50, h: 100, color: YELLOW }, { kind: "rect", x: 105, y: 10, w: 45, h: 100, color: RED }] },
  { name: "4 quadrados", bg: WHITE, colors: 4, shapes: [{ kind: "rect", x: 10, y: 10, w: 65, h: 45, color: RED }, { kind: "rect", x: 85, y: 10, w: 65, h: 45, color: BLUE }, { kind: "rect", x: 10, y: 65, w: 65, h: 45, color: GREEN }, { kind: "rect", x: 85, y: 65, w: 65, h: 45, color: YELLOW }] },
  { name: "anel preto com miolo rosa", bg: WHITE, colors: 2, shapes: [{ kind: "ring", cx: 80, cy: 60, r: 50, inner: 30, color: BLACK }, { kind: "circle", cx: 80, cy: 60, r: 30, color: PINK }] },
  { name: "com ruído de JPEG", bg: WHITE, colors: 2, noise: 18, shapes: [{ kind: "rect", x: 20, y: 20, w: 120, h: 80, color: BLUE }, { kind: "circle", cx: 80, cy: 60, r: 25, color: YELLOW }] },
  { name: "fundo colorido removido", bg: GREEN, colors: 2, shapes: [{ kind: "circle", cx: 80, cy: 60, r: 45, color: BLACK }, { kind: "circle", cx: 80, cy: 60, r: 20, color: WHITE }] },
  { name: "fundo mantido vira cor", bg: "#dddddd", colors: 2, removeBg: false, shapes: [{ kind: "circle", cx: 80, cy: 60, r: 40, color: BLUE }] },
  { name: "detalhe fino (traço de 3 px)", bg: WHITE, colors: 2, shapes: [{ kind: "rect", x: 20, y: 20, w: 120, h: 80, color: RED }, { kind: "rect", x: 20, y: 58, w: 120, h: 3, color: BLACK }] },
  { name: "cores próximas (vermelho e laranja)", bg: WHITE, colors: 2, shapes: [{ kind: "rect", x: 10, y: 20, w: 70, h: 80, color: RED }, { kind: "rect", x: 80, y: 20, w: 70, h: 80, color: "#f97316" }] },
  { name: "pede 4 mas a arte tem 2", bg: WHITE, colors: 4, shapes: [{ kind: "circle", cx: 60, cy: 60, r: 35, color: BLUE }, { kind: "circle", cx: 110, cy: 60, r: 25, color: RED }] },
];

/** Cor "verdadeira" no centro de cada pixel (a forma mais de cima). */
function truth(c: Case, x: number, y: number): string {
  let col = c.bg;
  for (const s of c.shapes) {
    const px = x + 0.5, py = y + 0.5;
    const hit =
      s.kind === "circle" ? Math.hypot(px - s.cx, py - s.cy) <= s.r : s.kind === "rect" ? px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h : Math.hypot(px - s.cx, py - s.cy) <= s.r && Math.hypot(px - s.cx, py - s.cy) >= s.inner;
    if (hit) col = s.color;
  }
  return col;
}

const labDist = (a: string, b: string) => {
  const [p, q] = [rgbToLab(...hexToRgb(a)), rgbToLab(...hexToRgb(b))];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

describe("paleta (Lab)", () => {
  test("rgbToLab: branco ≈ L100, preto ≈ L0, cinza sem croma", () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
    const g = rgbToLab(128, 128, 128);
    expect(Math.abs(g[1]) + Math.abs(g[2])).toBeLessThan(0.5);
  });

  test("matchPalette troca cada cor pelo filamento mais parecido, sem repetir filamento", () => {
    expect(matchPalette(["#e01010", "#1030d0"], ["#facc15", "#2563eb", "#d6262e"])).toEqual(["#d6262e", "#2563eb"]);
    // dois vermelhos: o 1º (maior área) escolhe antes, o 2º fica com o que sobrou
    expect(matchPalette(["#e01010", "#c02020"], ["#d6262e", "#1c1c1e"])).toEqual(["#d6262e", "#1c1c1e"]);
    // menos filamentos que cores: a cor restante fica como veio da imagem
    expect(matchPalette(["#e01010", "#1030d0"], ["#d6262e"])).toEqual(["#d6262e", "#1030d0"]);
  });

  test("stackedMasks: camada k cobre as cores k..n-1 (sem fresta ao empilhar)", () => {
    const labels = Uint8Array.from([BG, 0, 1, 2, 1]);
    const [a, b, c] = stackedMasks(labels, 3);
    expect([...a]).toEqual([0, 1, 1, 1, 1]);
    expect([...b]).toEqual([0, 0, 1, 1, 1]);
    expect([...c]).toEqual([0, 0, 0, 1, 0]);
  });

  test.each(BANK)("banco: $name", (c) => {
    const img = synthImage(W, H, c.bg, c.shapes, c.noise ?? 0);
    const q = quantize(img.rgba, W, H, { colors: c.colors, removeBg: c.removeBg ?? true, minAreaPx: 12 });
    const expected = [...new Set([...(c.removeBg === false ? [c.bg] : []), ...c.shapes.map((s) => s.color)])];
    expect(q.palette.length).toBe(Math.min(c.colors, expected.length));
    // cada cor achada está perto de uma cor real da arte
    for (const p of q.palette) expect(Math.min(...expected.map((e) => labDist(p, e)))).toBeLessThan(8);
    // ≥ 97% dos pixels com a cor certa (o resto é borda serrilhada)
    let ok = 0, total = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = truth(c, x, y);
        const l = q.labels[y * W + x];
        if (c.removeBg !== false && t === c.bg) {
          total++;
          if (l === BG) ok++;
          continue;
        }
        total++;
        if (l !== BG && labDist(q.palette[l], t) < 8) ok++;
      }
    }
    expect(ok / total).toBeGreaterThan(0.97);
  });

  test("paleta ordenada da maior área para a menor (a maior é a camada de baixo)", () => {
    const img = synthImage(W, H, WHITE, [{ kind: "circle", cx: 80, cy: 60, r: 50, color: BLUE }, { kind: "circle", cx: 80, cy: 60, r: 20, color: RED }]);
    const q = quantize(img.rgba, W, H, { colors: 2, removeBg: true, minAreaPx: 12 });
    expect(labDist(q.palette[0], BLUE)).toBeLessThan(8);
    expect(labDist(q.palette[1], RED)).toBeLessThan(8);
  });

  test("com filamentos cadastrados, a paleta usa as cores deles", () => {
    const img = synthImage(W, H, WHITE, [{ kind: "circle", cx: 80, cy: 60, r: 50, color: "#1e40af" }, { kind: "circle", cx: 80, cy: 60, r: 20, color: "#ef4444" }]);
    const q = quantize(img.rgba, W, H, { colors: 2, removeBg: true, minAreaPx: 12, filaments: [YELLOW, RED, BLUE, BLACK] });
    expect(q.palette).toEqual([BLUE, RED]);
  });

  test("ilhas minúsculas (pontinhos de ruído) são absorvidas pela cor vizinha", () => {
    const img = synthImage(W, H, WHITE, [{ kind: "rect", x: 20, y: 20, w: 120, h: 80, color: BLUE }, { kind: "rect", x: 80, y: 60, w: 2, h: 2, color: RED }, { kind: "circle", cx: 50, cy: 50, r: 15, color: RED }]);
    const q = quantize(img.rgba, W, H, { colors: 2, removeBg: true, minAreaPx: 30 });
    expect(q.labels[61 * W + 81]).toBe(0); // o pontinho vermelho virou azul
    expect(q.labels[50 * W + 50]).toBe(1); // o círculo grande continua vermelho
  });

  test("fundo todo removido: erro claro", () => {
    const img = synthImage(40, 40, WHITE, []);
    // floodBackground recusa remover > 96%; forçamos imagem só de fundo transparente
    img.rgba.forEach((_, i) => i % 4 === 3 && (img.rgba[i] = 0));
    expect(() => quantize(img.rgba, 40, 40, { colors: 2, removeBg: true, minAreaPx: 1 })).toThrow(/vazia/);
  });

  test("fixtures reais (JPEG): logo azul com miolos brancos e contorno preto = 3 cores; desenho de linha = 2", () => {
    const logo = loadFixture("logo.jpg", 400);
    const q = quantize(logo.rgba, logo.w, logo.h, { colors: 4, removeBg: true, minAreaPx: 40 });
    expect(q.palette.length).toBe(3);
    expect(labDist(q.palette[0], BLUE)).toBeLessThan(8);
    const d = loadFixture("desenho.jpg", 400);
    expect(quantize(d.rgba, d.w, d.h, { colors: 4, removeBg: true, minAreaPx: 40 }).palette.length).toBe(2);
  });
});
