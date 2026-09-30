import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildLidBox, DEFAULT_LID_BOX as D, INLAY, lidBoxSolids, type LidBoxParams } from "./lidBox";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const box = (p: Partial<LidBoxParams> = {}) => buildLidBox(ctx(), { ...D, ...p });
const part = (p: Partial<LidBoxParams>, model: string, name: string) => box(p).models.find((m) => m.name === model)?.parts.find((x) => x.name === name);

/** Tampa fechada, deslocada `dz`: volume que invade a caixa. */
function overlap(p: Partial<LidBoxParams>, dz: number, dx = 0): number {
  const { box: b, lid } = lidBoxSolids(M, { ...D, ...p });
  const moved = lid.translate([dx, 0, dz]);
  const hit = b.intersect(moved);
  const v = hit.volume();
  for (const s of [b, lid, moved, hit] as Solid[]) s.delete();
  return v;
}

describe("Caixa com tampa (#94)", { timeout: 60_000 }, () => {
  test("medidas internas viram a caixa: parede dos dois lados, fundo embaixo", () => {
    const m = part({ lid: "snap", innerW: 60, innerD: 40, innerH: 30, wall: 2, floor: 1.5 }, "Caixa", "Caixa")!.mesh;
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(64, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(44, 1);
    expect(b.min[2]).toBeCloseTo(0, 2);
    expect(b.max[2]).toBeCloseTo(31.5, 1);
  });

  for (const lid of ["snap", "slide"] as const)
    test(`tampa ${lid}: fechada não invade a caixa e tem folga; empurrada contra a caixa, bate`, () => {
      expect(overlap({ lid }, 0)).toBeLessThan(0.01);
      // encaixe: descer bate na borda; deslizante: subir bate no trilho (a cauda de andorinha segura)
      expect(overlap({ lid }, lid === "snap" ? -0.8 : 0.8)).toBeGreaterThan(1);
      // a folga existe: andar para o lado um pouco menos que ela não bate
      expect(overlap({ lid, clearance: 0.4 }, 0, 0.35)).toBeLessThan(0.01);
    });

  test("tampa deslizante: caixa ganha a espessura da tampa em altura e a frente fica aberta para a tampa entrar", () => {
    const b = meshBounds([part({ lid: "slide" }, "Caixa", "Caixa")!.mesh])!;
    expect(b.max[2]).toBeCloseTo(D.floor + D.innerH + D.lidT, 1);
    const { box: s, lid } = lidBoxSolids(M, { ...D, lid: "slide" });
    // a tampa sai pela frente (−Y) sem bater
    const out = lid.translate([0, -(D.innerD + 3 * D.wall), 0]);
    const path = M.Manifold.hull([lid, out]);
    const hit = s.intersect(path);
    expect(hit.volume()).toBeLessThan(0.01);
    for (const x of [s, lid, out, path, hit]) x.delete();
  });

  test("divisórias: 3×2 compartimentos acrescentam 2 + 1 paredes", () => {
    const v = (dx: number, dy: number) => volume(part({ lid: "slide", dividersX: dx, dividersY: dy }, "Caixa", "Caixa")!.mesh);
    const extra = v(3, 2) - v(1, 1);
    const t = 1.2, h = D.innerH;
    const expected = 2 * t * D.innerD * h + t * D.innerW * h - 2 * t * t * h;
    expect(extra / expected).toBeGreaterThan(0.95);
    expect(extra / expected).toBeLessThan(1.05);
  });

  test("texto em relevo na deslizante (em cima) e embutido na de encaixe (face na mesa, espelhado), com aviso", () => {
    const slideText = part({ lid: "slide", text: "Linhas", textMode: "raised" }, "Tampa", "Texto")!.mesh;
    expect(meshBounds([slideText])!.min[2]).toBeCloseTo(D.lidT, 1);
    const out = box({ lid: "snap", text: "Linhas", textMode: "raised" });
    const t = out.models.find((m) => m.name === "Tampa")!.parts.find((x) => x.name === "Texto")!.mesh;
    expect(meshBounds([t])!.max[2]).toBeCloseTo(INLAY, 2);
    expect(out.warnings?.join(" ")).toMatch(/embutido/);
    expect(out.elements?.map((e) => e.id)).toContain("text");
  });

  test("gravado tira da tampa e não cria peça; sem texto nem desenho a tampa é lisa", () => {
    const lidVol = (p: Partial<LidBoxParams>) => volume(part(p, "Tampa", "Tampa")!.mesh);
    expect(lidVol({ lid: "slide", text: "Linhas", textMode: "engraved" })).toBeLessThan(lidVol({ lid: "slide", text: "" }));
    expect(part({ lid: "slide", text: "Linhas", textMode: "engraved" }, "Tampa", "Texto")).toBeUndefined();
    expect(box({ text: "" }).models.find((m) => m.name === "Tampa")!.parts).toHaveLength(1);
  });

  test("avisa quando a caixa passa da mesa de 256 mm", () => {
    expect(box({ innerW: 260 }).warnings?.join(" ")).toMatch(/mesa/);
  });
});
