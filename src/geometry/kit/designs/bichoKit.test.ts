// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import type { CS, ManifoldToplevel } from "../../manifold";
import { getManifold } from "../../manifold";
import type { ModelCtx } from "../../models/common";
import { scoped } from "../../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, kitInstances } from "../index";
import { bichoTemplate } from "./bichoKit";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: CS | null = null): ModelCtx => ({ M, art, text });

const VARIANTS: { name: string; p: Record<string, string | number> }[] = [
  { name: "padrão", p: {} },
  { name: "gato, cauda curta, 6 fatias", p: { head: "cat", tail: "short", slices: 6 } },
  { name: "saurópode, 2 fatias", p: { head: "sauro", tail: "thick", slices: 2, length: 110 } },
  { name: "saurópode, 6 fatias", p: { head: "sauro", tail: "thick", slices: 6, length: 70 } },
  { name: "T-rex, quase retangular", p: { head: "trex", tail: "thick", profile: "boxy" } },
  { name: "legado: dino abre como saurópode", p: { head: "dino", tail: "thick" } },
  { name: "pequeno", p: { length: 50, tail: "up" } },
];

/** O ponto está dentro do fecho convexo dos pontos (cadeia monótona de Andrew). */
function insideHull(pt: [number, number], pts: [number, number][]): boolean {
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: [number, number][]) => {
    const h: [number, number][] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const hull = [...build(sorted), ...build([...sorted].reverse())];
  return hull.every((a, i) => cross(a, hull[(i + 1) % hull.length], pt) >= 0);
}

describe("kit bicho de 4 patas", { timeout: 120_000 }, () => {
  test.each(VARIANTS)("$name: montado sem colisão, folgas dos pares dentro do esperado", ({ p }) =>
    scoped((k) => {
      const { insts, build, env } = kitInstances(M, k, bichoTemplate, p);
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, build.assembly), build.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
    }));

  test.each(VARIANTS)("$name: o cartão sai, cada peça numerada e presa por 2+ pontos de corte", ({ p }) => {
    const o = buildKitTemplate(ctx(), bichoTemplate, { showAssembled: false, ...p });
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    const n = Number(p.slices ?? 4);
    expect(o.meta!.pieces).toBeLessThanOrEqual(n + 3); // coluna, N fatias, cabeça, cauda (menos se o cartão limitou as fatias)
    expect(o.meta!.pieces).toBeGreaterThanOrEqual(5);
    expect(o.warnings!.join(" ")).toMatch(/Para montar/);
  });

  test("fatias demais para o comprimento: usa as que cabem e avisa", () => {
    const o = buildKitTemplate(ctx(), bichoTemplate, { showAssembled: false, length: 120, slices: 6 });
    expect(o.meta!.pieces).toBe(4 + 3);
    expect(o.warnings!.join(" ")).toMatch(/só cabem 4 fatias/);
  });

  test.each(VARIANTS)("$name: o bicho fica em pé (o centro de massa cai dentro dos apoios no chão)", ({ p }) =>
    scoped((k) => {
      const { insts, build } = kitInstances(M, k, bichoTemplate, p);
      const sol = assemblySolids(M, k, insts, build.assembly);
      let vol = 0, cx = 0, cy = 0;
      const ground: [number, number][] = [];
      for (const part of sol)
        for (const solid of part.colors.values()) {
          const mesh = solid.getMesh();
          const v = mesh.vertProperties, st = mesh.numProp, tri = mesh.triVerts;
          const P = (i: number): [number, number, number] => [v[i * st], v[i * st + 1], v[i * st + 2]];
          for (let i = 0; i < tri.length; i += 3) {
            const [a, b, c] = [P(tri[i]), P(tri[i + 1]), P(tri[i + 2])];
            const tv = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
            vol += tv;
            cx += (tv * (a[0] + b[0] + c[0])) / 4;
            cy += (tv * (a[1] + b[1] + c[1])) / 4;
          }
          for (let i = 0; i < v.length; i += st) if (v[i + 2] < 0.05) ground.push([v[i], v[i + 1]]);
        }
      const com: [number, number] = [cx / vol, cy / vol];
      expect(ground.length, "nada toca o chão").toBeGreaterThan(3);
      expect(insideHull(com, ground), `centro de massa ${com.map((x) => x.toFixed(1))} fora dos apoios`).toBe(true);
    }));

  test("a mesma montagem sai com bico de 0,2 e 0,6", () => {
    for (const w of [0.2, 0.6]) scoped((k) => expect(() => kitInstances(M, k, bichoTemplate, { fit: w })).not.toThrow());
  });
});
