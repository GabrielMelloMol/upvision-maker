import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { autoSelections, colorClusters, colorPreview, hasMaterialColors, nearestTriangle, regionTriangles } from "./colorRegions";
import { partSolid, splitByColor } from "./colorSplit";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { readFileSync } from "node:fs";
import { read3mf } from "./threemfRead";
import { colorCube3mf, CUBE_COLORS } from "../test/colorCube";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// cima (um triângulo vermelho e o outro quase igual) e baixo vermelhos: dois lugares que não se tocam; frente azul; o resto cinza
const FILE = () => read3mf(colorCube3mf({ cima: [1, 3], baixo: 1, frente: 2 }));

describe("cores por material do 3MF (#229)", { timeout: 60_000 }, () => {
  test("o leitor pega a cor de cada triângulo dos materiais do arquivo", () => {
    const part = FILE().objects[0].parts[0];
    expect(hasMaterialColors(FILE())).toBe(true);
    expect(part.triColors).toHaveLength(12);
    expect(new Set(part.triColors)).toEqual(new Set(CUBE_COLORS));
  });

  test("tolerância: o vermelho quase igual entra no grupo do vermelho; com tolerância 0 vira outro grupo", () => {
    const f = FILE();
    const loose = colorClusters(f, 8);
    expect(loose).toHaveLength(3);
    expect(loose.map((c) => c.share.toFixed(2)).join()).toBe("0.50,0.33,0.17"); // cinza 6 de 12 triângulos; vermelho 4; azul 2 (iguais em área)
    expect(colorClusters(f, 0)).toHaveLength(4);
  });

  test("região que toca: a partir do triângulo clicado pega só o vermelho ligado a ele; 'todas' pega as duas áreas", () => {
    const part = FILE().objects[0].parts[0];
    const touching = regionTriangles(part, { color: "#ff0000", scope: "touching", seed: { obj: 0, part: 0, tri: 2 } }, 8); // triângulo 2 = cima
    expect(touching.sort()).toEqual([2, 3]);
    const all = regionTriangles(part, { color: "#ff0000", scope: "all" }, 8);
    expect(all.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]); // cima e baixo
    expect(regionTriangles(part, { color: "#ff0000", scope: "all" }, 0).sort((a, b) => a - b)).toEqual([0, 1, 2]); // sem tolerância o quase-vermelho fica de fora
  });

  test("separar sozinho: base cinza + vermelho + azul, volumes somam o cubo e cada cor entra 1 mm", () => {
    const { models, colors, warnings } = splitByColor(M, FILE(), { depth: 1, mode: "parts" });
    expect(warnings).toEqual([]);
    expect(colors).toHaveLength(3);
    const total = colors.reduce((s, c) => s + c.volume, 0);
    expect(total).toBeCloseTo(8000, 0);
    const red = colors.find((c) => c.filament > 1 && c.color.startsWith("#f"))!;
    expect(red.volume).toBeCloseTo(800, 0); // cima + baixo, 1 mm cada
    expect(models[0].parts.map((p) => p.color)).toContain("#0000ff");
    expect(models[0].parts[0].color).toBe("#c8c8c8"); // a base fica na cor do grupo maior
  });

  test("só a região escolhida: cima vermelho separado, o vermelho de baixo continua na base", () => {
    const f = FILE();
    const sel = [{ color: "#ff0000", scope: "touching" as const, seed: { obj: 0, part: 0, tri: 2 } }];
    const { colors } = splitByColor(M, f, { depth: 1, mode: "parts", selections: sel });
    const red = colors.find((c) => c.filament > 1)!;
    expect(red.volume).toBeCloseTo(400, 0);
    expect(colors).toHaveLength(2);
  });

  test("objetos separados: manter a posição deixa cada cor onde estava; sem isso elas são afastadas", () => {
    const keep = splitByColor(M, FILE(), { depth: 1, mode: "objects", keepPosition: true }).models.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    expect(keep.every((b) => b.min[0] >= -0.001 && b.max[0] <= 20.001)).toBe(true);
    const moved = splitByColor(M, FILE(), { depth: 1, mode: "objects" }).models.map((m) => meshBounds(m.parts.map((p) => p.mesh))!);
    expect(moved[1].min[0]).toBeGreaterThan(moved[0].max[0]);
  });

  test("clique: o triângulo mais perto do ponto e a cor dele; a prévia separa uma parte por grupo", () => {
    const f = FILE();
    const hit = nearestTriangle(f, [10, 10, 20])!; // centro da face de cima
    expect(hit.color).toBe("#ff0000");
    expect(autoSelections(colorClusters(f, 8))).toHaveLength(2);
    const preview = colorPreview(f, 8, [{ color: "#0000ff", scope: "all" }]);
    expect(preview[0].parts).toHaveLength(3);
    expect(preview[0].parts.some((p) => p.name.startsWith("Separar"))).toBe(true);
  });

  test("peça de verdade (personagem pintado por região): nenhuma peça sai com fragmento minúsculo (o fatiador recusa o objeto)", () => {
    const real = read3mf(new Uint8Array(readFileSync("tests/fixtures/3mf/personagem-colorido-material.3mf")));
    const { models, warnings } = splitByColor(M, real, { depth: 1, mode: "parts" });
    expect(warnings.join(" ")).not.toMatch(/Tirei/); // as frestas entre os prismas são calçadas: nada sobra para remover
    for (const part of models[0].parts) {
      const s = partSolid(M, { id: "x", name: part.name, extruder: 1, mesh: part.mesh, paint: null, triColors: null });
      for (const c of s.decompose()) expect(c.volume()).toBeGreaterThanOrEqual(4);
    }
  });
});
