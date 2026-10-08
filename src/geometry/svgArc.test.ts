import { describe, expect, test } from "vitest";
import { parsePath } from "./svgPath";
import { pathWithoutArcs } from "./svgArc";

/** Pontos de uma curva cúbica (t de 0 a 1). */
const cubic = (p: number[], t: number): [number, number] => {
  const u = 1 - t;
  return [u ** 3 * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t ** 3 * p[6], u ** 3 * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t ** 3 * p[7]];
};

/** Todos os pontos amostrados do caminho (só M/L/C depois da conversão). */
function sample(d: string): [number, number][] {
  const out: [number, number][] = [];
  let cur: [number, number] = [0, 0];
  for (const c of parsePath(d)) {
    if (c.c === "M" || c.c === "L") {
      cur = [c.p[0], c.p[1]];
      out.push(cur);
    } else if (c.c === "C") {
      for (let i = 1; i <= 16; i++) out.push(cubic([...cur, ...c.p], i / 16));
      cur = [c.p[4], c.p[5]];
    }
  }
  return out;
}

describe("arcos viram Béziers (SVG F.6.5)", () => {
  test("a saída não tem mais o comando A e começa e termina onde o arco começa e termina", () => {
    const d = pathWithoutArcs("M20 50 A30 30 0 0 1 80 50");
    expect(d).not.toMatch(/[Aa]/);
    const pts = sample(d);
    expect(pts[0]).toEqual([20, 50]);
    expect(pts.at(-1)![0]).toBeCloseTo(80, 3);
    expect(pts.at(-1)![1]).toBeCloseTo(50, 3);
  });

  test("meio círculo de raio 30: todos os pontos a 30 do centro (flag de varredura escolhe o lado)", () => {
    for (const [sweep, side] of [[1, -1], [0, 1]] as const) {
      const pts = sample(pathWithoutArcs(`M20 50 A30 30 0 0 ${sweep} 80 50`));
      for (const [x, y] of pts) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(30, 1);
      expect(Math.sign(pts[8][1] - 50)).toBe(side); // o meio do arco fica em cima (y menor) ou embaixo
    }
  });

  test("flags e números compactos, como em bibliotecas de ícones: a30 30 0 0160 0 e 1.5.5", () => {
    const compact = sample(pathWithoutArcs("M20 50a30 30 0 0160 0"));
    const spaced = sample(pathWithoutArcs("M20 50 a30 30 0 0 1 60 0"));
    expect(compact).toEqual(spaced);
    expect(pathWithoutArcs("M0 0l1.5.5")).toBe(pathWithoutArcs("M0 0 l1.5 .5"));
  });

  test("relativos, H, V e fechamento continuam certos depois de um arco", () => {
    const d = pathWithoutArcs("M10 10 h20 a10 10 0 0 1 10 10 v20 H10 z");
    const pts = sample(d);
    expect(d.endsWith("Z")).toBe(true); // o caminho continua fechado
    expect(pts.at(-1)).toEqual([10, 40]); // H10 depois do v20
    expect(pts.some(([x, y]) => Math.abs(x - 40) < 1e-6 && Math.abs(y - 20) < 1e-6)).toBe(true); // fim do arco
    expect(pts.some(([x, y]) => Math.abs(x - 40) < 1e-6 && Math.abs(y - 40) < 1e-6)).toBe(true); // v20 a partir do fim do arco
  });

  test("elipse com rotação própria: pontos satisfazem a equação da elipse girada", () => {
    const rx = 40, ry = 15, rot = 30;
    const r = (rot * Math.PI) / 180;
    // dois arcos completam a elipse com centro (50, 50)
    const p0 = [50 + rx * Math.cos(r), 50 + rx * Math.sin(r)];
    const p1 = [50 - rx * Math.cos(r), 50 - rx * Math.sin(r)];
    const d = pathWithoutArcs(`M${p0[0]} ${p0[1]} A${rx} ${ry} ${rot} 0 1 ${p1[0]} ${p1[1]} A${rx} ${ry} ${rot} 0 1 ${p0[0]} ${p0[1]}Z`);
    for (const [x, y] of sample(d)) {
      const u = (x - 50) * Math.cos(r) + (y - 50) * Math.sin(r);
      const v = -(x - 50) * Math.sin(r) + (y - 50) * Math.cos(r);
      expect((u / rx) ** 2 + (v / ry) ** 2).toBeCloseTo(1, 2);
    }
  });

  test("raios pequenos demais crescem até o arco existir; raio zero vira reta; caminho inválido volta como veio", () => {
    const small = sample(pathWithoutArcs("M0 0 A1 1 0 0 1 100 0"));
    expect(Math.hypot(small[8][0] - 50, small[8][1])).toBeCloseTo(50, 1); // meio círculo de raio 50
    expect(pathWithoutArcs("M0 0 A0 5 0 0 1 10 0")).toMatch(/L\s*10/);
    expect(pathWithoutArcs("não é caminho")).toBe("não é caminho");
  });
});
