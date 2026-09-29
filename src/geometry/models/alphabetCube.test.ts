import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { buildAlphabetCube, DEFAULT_ALPHABET_CUBE as D, type AlphabetCubeParams } from "./alphabetCube";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5, h], true) : null) });
const build = (p: Partial<AlphabetCubeParams> = {}) => buildAlphabetCube(ctx(), { ...D, ...p });

describe("cubo alfabeto (#52)", { timeout: 30_000 }, () => {
  test("um cubo: lado pedido, apoiado na mesa, 6 desenhos rentes na outra cor", () => {
    const { models } = build();
    expect(models).toHaveLength(1);
    const [body, art] = models[0].parts;
    const b = modelsBounds(models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.size, 1);
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(D.size, 1);
    // cada face tem um desenho 0,5·s × s (s = 62% do lado) e profundidade `depth`
    const side = D.size * 0.62;
    expect(volume(art.mesh)).toBeCloseTo(6 * 0.5 * side * side * D.depth, -1);
    // rente: nada do desenho passa da caixa do cubo
    const ab = meshBounds([art.mesh])!;
    expect(ab.max[2]).toBeLessThanOrEqual(D.size + 1e-3);
    expect(art.color).not.toBe(body.color);
  });

  test("faces vazias ficam lisas; sem nada vira prévia vazia", () => {
    const one = build({ face2: "", face3: "", face4: "", face5: "", face6: "" }).models[0];
    expect(volume(one.parts[1].mesh)).toBeCloseTo(0.5 * (D.size * 0.62) ** 2 * D.depth, -1);
    expect(() => build({ face1: "", face2: "", face3: "", face4: "", face5: "", face6: "" })).toThrow("Digite o que vai em cada face");
  });

  test("kit de nome: um cubo por letra, em fila, sem sobrepor; avisos de segurança e de mesa", () => {
    const { models, warnings } = build({ kit: "ANA" });
    expect(models.map((m) => m.name)).toEqual(["A", "N", "A"]);
    const bs = models.map((m) => modelsBounds([m])!);
    expect(bs[1].min[0]).toBeGreaterThan(bs[0].max[0]);
    expect(warnings!.join(" ")).toMatch(/menores de 3 anos/);
    expect(build({ kit: "GABRIELA", size: 40 }).warnings!.join(" ")).toMatch(/passa da mesa/);
  });

  test("desenho assimétrico lê certo de fora: na frente e embaixo o traço à direita fica à direita de quem olha", () => {
    // "letra" de teste: bloco só na metade direita da caixa do texto
    const right: ModelCtx = { M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.union([M.CrossSection.square([h * 0.1, h], true).translate([-h * 0.45, 0]), M.CrossSection.square([h * 0.4, h * 0.6], true).translate([h * 0.3, 0])]) : null) };
    const only = (i: number) => {
      const faces = ["", "", "", "", "", ""];
      faces[i] = "F";
      const [, art] = buildAlphabetCube(right, { ...D, face1: faces[0], face2: faces[1], face3: faces[2], face4: faces[3], face5: faces[4], face6: faces[5] }).models[0].parts;
      // fração do volume do desenho em x > 0 (o bloco grosso fica à direita do traço fino)
      const solid = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: art.mesh.positions, triVerts: art.mesh.indices }));
      const half = M.Manifold.cube([100, 200, 200]).translate([0, -100, -100]);
      const share = solid.intersect(half).volume() / solid.volume();
      [solid, half].forEach((o) => o.delete());
      return share - 0.5;
    };
    // frente: olhando de −Y, a direita é +X; embaixo: olhando de baixo (cabeça para +Y), a direita é −X
    expect(only(0)).toBeGreaterThan(0);
    expect(only(5)).toBeLessThan(0);
  });
});
