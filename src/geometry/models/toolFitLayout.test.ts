import { describe, expect, test } from "vitest";
import type { ToolOutline } from "../../organizer/types";
import { arrange, boundsOf, orient } from "./toolFitLayout";

const rect = (id: string, w: number, h: number, angleDeg = 0, at: [number, number] = [50, 50]): ToolOutline => {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const pts: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return { id, points: pts.map(([x, y]) => [at[0] + x * c - y * s, at[1] + x * s + y * c]) };
};
const size = (o: ToolOutline) => {
  const b = boundsOf(o.points);
  return [b.maxX - b.minX, b.maxY - b.minY];
};

describe("orientar a ferramenta (#169)", () => {
  test("ferramenta fotografada torta fica deitada no menor retângulo, lado comprido em X, no canto (0, 0)", () => {
    const o = orient(rect("chave", 150, 20, 33));
    const [w, h] = size(o);
    expect(w).toBeCloseTo(150, 1);
    expect(h).toBeCloseTo(20, 1);
    const b = boundsOf(o.points);
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.minY).toBeCloseTo(0, 6);
  });

  test("furos giram junto e ficam dentro do contorno", () => {
    const tool = { ...rect("tesoura", 100, 40, 90), holes: [rect("f", 10, 10, 90, [50, 80]).points] };
    const o = orient(tool);
    const out = boundsOf(o.points), hole = boundsOf(o.holes![0]);
    expect(hole.minX).toBeGreaterThan(out.minX);
    expect(hole.maxX).toBeLessThan(out.maxX);
    expect(hole.maxY - hole.minY).toBeCloseTo(10, 1);
  });
});

describe("arrumar várias ferramentas (#169)", () => {
  test("cabe tudo, sem sobrepor (contando folga + parede), com a borda da parede", () => {
    const tools = [rect("a", 150, 20, 10), rect("b", 120, 40), rect("c", 60, 60, 45), rect("d", 90, 15)];
    const r = arrange(tools, { width: 200, inflate: 0.6, gap: 3 });
    expect(r.missing).toEqual([]);
    const boxes = r.placed.map((o) => boundsOf(o.points));
    for (const b of boxes) {
      expect(b.minX - 0.6).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(b.minY - 0.6).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(b.maxX + 0.6 + 3).toBeLessThanOrEqual(r.size[0] + 1e-6);
      expect(b.maxY + 0.6 + 3).toBeLessThanOrEqual(r.size[1] + 1e-6);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const apart = p.maxX + 0.6 + 3 <= q.minX - 0.6 + 1e-6 || q.maxX + 0.6 + 3 <= p.minX - 0.6 + 1e-6 || p.maxY + 0.6 + 3 <= q.minY - 0.6 + 1e-6 || q.maxY + 0.6 + 3 <= p.minY - 0.6 + 1e-6;
        expect(apart, `${i} × ${j}`).toBe(true);
      }
    expect(r.size[0]).toBeLessThanOrEqual(200);
  });

  test("comprida demais para a largura: gira 90°; nem assim cabe: fica de fora", () => {
    const r = arrange([rect("longa", 150, 20)], { width: 60, height: 200, inflate: 0, gap: 2 });
    expect(r.missing).toEqual([]);
    const [w, h] = size(r.placed[0]);
    expect(w).toBeCloseTo(20, 1);
    expect(h).toBeCloseTo(150, 1);
    expect(arrange([rect("enorme", 300, 300)], { width: 100, height: 100, inflate: 0, gap: 2 }).missing).toEqual(["enorme"]);
  });

  test("espaço reservado em cima de cada ferramenta (recorte do dedo) não alarga as colunas", () => {
    const r = arrange([rect("a", 50, 20), rect("b", 50, 20)], { width: 200, inflate: 0, gap: 2, reserveTop: 11 });
    const [a, b] = r.placed.map((o) => boundsOf(o.points));
    expect(Math.abs(a.minY - b.minY)).toBeLessThan(1e-6); // mesma prateleira
    expect(Math.abs(a.minX - b.minX)).toBeCloseTo(52, 6);
    expect(r.size[1]).toBeCloseTo(2 + 20 + 11 + 2, 6);
  });

  test("altura limitada: o que não cabe na área sobra para a próxima", () => {
    const tools = [rect("a", 80, 50), rect("b", 80, 50), rect("c", 80, 50)];
    const r = arrange(tools, { width: 90, height: 120, inflate: 0, gap: 2 });
    expect(r.placed).toHaveLength(2);
    expect(r.missing).toEqual(["c"]);
  });
});
