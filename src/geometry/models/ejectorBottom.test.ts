import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { overhangArea } from "../cutSuggest";
import type { Mesh } from "../types";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { sq } from "../testUtil";
import { buildEjector, DEFAULT_EJECTOR } from "./brigadeiroEjector";
import { dome, hasSharpFeatures, inradius, roundEdge, scaleDome } from "./ejectorBottom";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const square = () => new M.CrossSection([sq(10)], "NonZero"); // 20 × 20
const disc = () => M.CrossSection.circle(10, 96);

describe("fundo arredondado do ejetor (#62)", { timeout: 30_000 }, () => {
  test("inradius: metade do lado do quadrado, raio do círculo", () => {
    expect(inradius(square())).toBeCloseTo(10, 1);
    expect(inradius(disc())).toBeCloseTo(10, 1);
  });

  test("borda arredondada: sobe r junto à parede e ocupa ≈ (1 − π/4)·r² por mm de perímetro", () => {
    const r = 3;
    const s = roundEdge(M, disc(), r);
    const b = s.boundingBox();
    expect(b.max[2]).toBeCloseTo(r, 5);
    const centroid = (r * (10 - 3 * Math.PI)) / (12 - 3 * Math.PI); // do filete, medido da parede (Pappus)
    const perimeter = 2 * Math.PI * (10 - centroid);
    expect(Math.abs(s.volume() / ((1 - Math.PI / 4) * r * r * perimeter) - 1)).toBeLessThan(0.02); // fatias de 0,2 mm
  });

  test("domo: altura pedida, centro vazio; suavização maior deixa o doce mais cheio (menos êmbolo)", () => {
    const cone = dome(M, disc(), 4, 0);
    const full = dome(M, disc(), 4, 1);
    expect(cone.boundingBox().max[2]).toBeCloseTo(4, 5);
    // cone sobre disco de raio 10 e altura 4: material = cilindro − cone = πr²h·(2/3)
    expect(cone.volume()).toBeCloseTo(Math.PI * 100 * 4 * (2 / 3), -1);
    expect(full.volume()).toBeLessThan(cone.volume());
    expect(full.volume()).toBeGreaterThan(0);
  });

  test("escala até um ponto (#252): no disco é igual ao domo; no retângulo o miolo mantém a proporção", () => {
    expect(scaleDome(M, disc(), 4, 0.7).volume()).toBeCloseTo(dome(M, disc(), 4, 0.7).volume(), -1);
    const sq20 = scaleDome(M, square(), 4, 0);
    expect(sq20.boundingBox().max[2]).toBeCloseTo(4, 5);
    // cone por escala sobre o quadrado 20 × 20: o vazio é uma pirâmide (1/3 de 400 × 4), o resto é êmbolo
    expect(sq20.volume()).toBeCloseTo(400 * 4 * (2 / 3), -1);
    // na fatia de z = 2,1 o miolo vazio é um quadrado de lado 20 × 2,1 / 4 = 10,5
    expect(400 - sq20.slice(2.1).area()).toBeCloseTo(10.5 * 10.5, 1);
    // retângulo 40 × 20: a escala mantém a proporção (21 × 10,5); o recuo tira a mesma faixa dos lados (30,5 × 10,5)
    const rect = M.CrossSection.square([40, 20], true);
    expect(800 - scaleDome(M, rect, 4, 0).slice(2.1).area()).toBeCloseTo(21 * 10.5, 1);
    expect(800 - dome(M, rect, 4, 0).slice(2.1).area()).toBeCloseTo(30.5 * 10.5, 1);
  });

  test("detecta ponta fina (estrela) e deixa passar formas cheias", () => {
    const star = new M.CrossSection(
      [Array.from({ length: 10 }, (_, i) => [Math.cos((i * Math.PI) / 5) * (i % 2 ? 4 : 12), Math.sin((i * Math.PI) / 5) * (i % 2 ? 4 : 12)] as [number, number])],
      "NonZero",
    );
    expect(hasSharpFeatures(star, 3)).toBe(true);
    expect(hasSharpFeatures(disc(), 3)).toBe(false);
  });

  test("ejetor: plano por padrão; arredondado e domo deixam o êmbolo mais alto e avisam a camada", () => {
    const ctx = { M, art: disc(), text: () => null };
    const flat = buildEjector(ctx, DEFAULT_EJECTOR);
    expect(flat.warnings).toEqual([]);
    const plunger = (o: typeof flat) => o.models[1].parts[0].mesh;
    const h = (o: typeof flat) => meshBounds([plunger(o)])!.max[2];
    const round = buildEjector(ctx, { ...DEFAULT_EJECTOR, bottom: "round", radius: 3 });
    const domed = buildEjector(ctx, { ...DEFAULT_EJECTOR, bottom: "dome", domeHeight: 5 });
    const scaled = buildEjector(ctx, { ...DEFAULT_EJECTOR, bottom: "scale", domeHeight: 5 });
    expect(h(round)).toBeCloseTo(h(flat) + 3, 5); // a borda (raio 3) cresce na face do doce, além do cabo (#281)
    expect(round.warnings!.join(" ")).toMatch(/0,08 a 0,12 mm/);
    expect(domed.warnings!.join(" ")).not.toMatch(/ponta fina/);
    expect(scaled.warnings!.join(" ")).toMatch(/0,08 a 0,12 mm/);
    for (const o of [round, domed, scaled]) {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: plunger(o).positions, triVerts: plunger(o).indices }));
      expect(s.status()).toBe("NoError");
      const f = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: plunger(flat).positions, triVerts: plunger(flat).indices }));
      expect(s.volume()).toBeGreaterThan(f.volume() + 10);
    }
  });

  test("o fundo fica na face que encosta no doce (a oposta ao cabo), nos 4 tipos (#281)", () => {
    const ctx = { M, art: disc(), text: () => null };
    const plunger = (bottom: "flat" | "round" | "dome" | "scale") => buildEjector(ctx, { ...DEFAULT_EJECTOR, bottom, radius: 3, domeHeight: 5 }).models[1].parts[0].mesh;
    expect(recess(plunger("flat"), 0)).toBeCloseTo(0, 1);
    expect(recess(plunger("dome"), 0)).toBeCloseTo(5, 0);
    expect(recess(plunger("scale"), 0)).toBeCloseTo(5, 0);
    expect(recess(plunger("round"), 0)).toBeCloseTo(3, 1); // miolo plano, recuado do raio
    expect(recess(plunger("round"), 14)).toBeLessThan(2.5); // perto da parede (raio do êmbolo 14,6) a curva desce
    // de cabeça para baixo (botão na mesa) imprime sem suporte; forma larga e baixa demais avisa
    const heart = M.CrossSection.union([M.CrossSection.circle(6, 64).translate([-4.2, 0]), M.CrossSection.circle(6, 64).translate([4.2, 0]), M.CrossSection.square([12, 12], true).rotate(45).translate([0, -5])]);
    for (const art of [disc(), heart]) for (const bottom of ["flat", "round", "dome", "scale"] as const) expect(overhangArea([buildEjector({ ...ctx, art }, { ...DEFAULT_EJECTOR, bottom }).models[1].parts[0].mesh])).toBeLessThan(2);
    expect(buildEjector(ctx, { ...DEFAULT_EJECTOR, bottom: "dome", size: 60, height: 8 }).warnings!.join(" ")).toMatch(/suporte no fatiador/);
  });
});

/** Quanto a face do doce afunda (mm) na reta vertical a `dx` do centro, medido da ponta do doce: a mais larga (a outra é o botão). */
function recess(mesh: Mesh, dx: number): number {
  const b = meshBounds([mesh])!;
  const v = mesh.positions, ix = mesh.indices;
  const span = (z: number) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i + 2] - z) < 0.3) [lo, hi] = [Math.min(lo, v[i]), Math.max(hi, v[i])];
    return hi - lo;
  };
  const candyUp = span(b.max[2]) > span(b.min[2]);
  const x = (b.min[0] + b.max[0]) / 2 + dx, y = (b.min[1] + b.max[1]) / 2;
  const hits: number[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const [a, c, d] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
    const area = (v[c] - v[a]) * (v[d + 1] - v[a + 1]) - (v[c + 1] - v[a + 1]) * (v[d] - v[a]);
    if (Math.abs(area) < 1e-9) continue;
    const w0 = ((v[c] - x) * (v[d + 1] - y) - (v[c + 1] - y) * (v[d] - x)) / area;
    const w1 = ((v[d] - x) * (v[a + 1] - y) - (v[d + 1] - y) * (v[a] - x)) / area;
    if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
    hits.push(w0 * v[a + 2] + w1 * v[c + 2] + (1 - w0 - w1) * v[d + 2]);
  }
  return candyUp ? b.max[2] - Math.max(...hits) : Math.min(...hits) - b.min[2];
}
