import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildKeycap, DEFAULT_KEYCAP as D, keyWidth, KEY_DEPTH_MM, STEM, type KeycapParams } from "./keycap";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: um bloco 0,5·h × h por letra. */
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text });
const build = (p: Partial<KeycapParams> = {}, c: ModelCtx = ctx()) => buildKeycap(c, { ...D, layout: "assembled", ...p });
const part = (o: ReturnType<typeof build>, name: string) => o.models[0].parts.find((x) => x.name === name)!.mesh;
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
/** Anéis (caixas) da fatia do corpo na altura z. */
const rings = (m: Parameters<typeof solid>[0], z: number) => {
  const s = solid(m), cs = s.slice(z);
  const out = (cs.toPolygons() as [number, number][][]).map((r) => {
    const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  cs.delete();
  s.delete();
  return out;
};

describe("tecla de teclado com legenda em 2 cores (#115)", { timeout: 60_000 }, () => {
  test("1 u: base de 18 × 18 mm na altura pedida, apoiada na mesa; 2,25 u: largura do passo", () => {
    const b = meshBounds([part(build(), "Tecla")])!;
    expect([b.max[0] - b.min[0], b.max[1] - b.min[1]].map((v) => Math.round(v * 100) / 100)).toEqual([keyWidth(1), KEY_DEPTH_MM]);
    expect(keyWidth(1)).toBeCloseTo(18, 5);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(D.height, 3);
    const wide = meshBounds([part(build({ units: 2.25 }), "Tecla")])!;
    expect(wide.max[0] - wide.min[0]).toBeCloseTo(2.25 * 19.05 - 1.05, 1);
  });

  test("o topo é menor que a base pelo afunilamento", () => {
    const top = rings(part(build(), "Tecla"), D.height - 0.2).map((r) => r.w);
    expect(Math.max(...top)).toBeCloseTo(keyWidth(1) - 2 * D.taper, 0);
    const flatSides = rings(part(build({ taper: 0 }), "Tecla"), D.height - 0.2).map((r) => r.w);
    expect(Math.max(...flatSides)).toBeCloseTo(keyWidth(1), 0);
  });

  test("haste MX: cilindro de 5,5 mm com a cruz de 4,1 mm + folga, no meio", () => {
    const stemZ = D.height - D.topThickness - STEM.height + 1; // dentro da haste
    const r = rings(part(build(), "Tecla"), stemZ);
    expect(r.some((x) => Math.abs(x.w - STEM.outer) < 0.2 && Math.abs(x.h - STEM.outer) < 0.2)).toBe(true); // o cilindro
    expect(r.some((x) => Math.abs(x.w - (STEM.cross + D.fit)) < 0.05 && Math.abs(x.h - (STEM.cross + D.fit)) < 0.05)).toBe(true); // o furo em cruz
    const loose = rings(part(build({ fit: 0.35 }), "Tecla"), stemZ);
    expect(loose.some((x) => Math.abs(x.w - (STEM.cross + 0.35)) < 0.05)).toBe(true);
  });

  test("a cavidade é aberta embaixo e o corpo é oco (volume bem menor que o maciço)", () => {
    const hollow = volume(part(build(), "Tecla")) + volume(part(build(), "Legenda"));
    const w = keyWidth(1);
    expect(hollow).toBeLessThan(w * KEY_DEPTH_MM * D.height * 0.45);
    expect(rings(part(build(), "Tecla"), 0.5).length).toBeGreaterThanOrEqual(2); // parede: contorno e vão
  });

  test("legenda embutida rente: mesma peça por fora (o volume total não depende da profundidade) e topo rente", () => {
    const total = (depth: number) => {
      const o = build({ legendDepth: depth });
      return volume(part(o, "Tecla")) + volume(part(o, "Legenda"));
    };
    expect(total(0.4)).toBeCloseTo(total(1), 2);
    const lb = meshBounds([part(build(), "Legenda")])!;
    expect(lb.max[2]).toBeCloseTo(D.height, 3); // rente ao topo plano
    expect(lb.max[2] - lb.min[2]).toBeCloseTo(D.legendDepth, 3);
    // a legenda fica dentro do topo e no meio
    expect((lb.min[0] + lb.max[0]) / 2).toBeCloseTo(0, 2);
    expect(lb.max[1] - lb.min[1]).toBeLessThanOrEqual(D.legendHeight + 1e-6);
  });

  test("ícone enviado vence o texto; sem nada, pede dados", () => {
    const icon = M.CrossSection.square([10, 10], true);
    const o = build({ legend: "XYZ" }, ctx(icon));
    const lb = meshBounds([part(o, "Legenda")])!;
    expect(lb.max[0] - lb.min[0]).toBeCloseTo(D.legendHeight, 1); // quadrado de 10×10 encaixado em legendHeight
    expect(() => build({ legend: "" })).toThrow(MissingInput);
  });

  test("de ponta-cabeça (padrão): topo na mesa, legenda em z 0 a profundidade, mesma altura e tamanho", () => {
    const o = buildKeycap(ctx(), { ...D, layout: "print" });
    const all = modelsBounds(o.models)!;
    expect(all.min[2]).toBeCloseTo(0, 3);
    expect(all.max[2]).toBeCloseTo(D.height, 3);
    const lb = meshBounds([part(o, "Legenda")])!;
    expect([lb.min[2], lb.max[2]]).toEqual([expect.closeTo(0, 3), expect.closeTo(D.legendDepth, 3)]);
    // a haste cresce para cima a partir do teto: no ponto mais alto da haste a peça é cheia só em volta
    const s = solid(part(o, "Tecla"));
    expect(s.status()).toBe("NoError");
    s.delete();
  });

  test("topo esférico: o centro fica na altura pedida e os cantos mais baixos; avisa o suporte de ponta-cabeça", () => {
    const sph = build({ profile: "sphere" });
    const flat = build();
    expect(meshBounds([part(sph, "Tecla"), part(sph, "Legenda")])!.max[2]).toBeCloseTo(D.height, 2);
    // perto do topo a calota cobre menos área que o topo plano (os cantos caem 1 mm)
    const areaAt = (o: ReturnType<typeof build>, z: number) => {
      const t = solid(part(o, "Tecla")), l = solid(part(o, "Legenda")), u = t.add(l);
      const cs = u.slice(z), a = cs.area();
      [cs, u, t, l].forEach((x) => x.delete());
      return a;
    };
    expect(areaAt(sph, D.height - 0.6)).toBeLessThan(areaAt(flat, D.height - 0.6) * 0.99);
    expect(buildKeycap(ctx(), { ...D, profile: "sphere", layout: "print" }).warnings!.join(" ")).toMatch(/pede suporte/);
    expect(sph.warnings!.join(" ")).not.toMatch(/pede suporte/);
  });

  test("avisos e erros: 2 u pede estabilizador; topo estreito e tecla baixa são recusados", () => {
    expect(build({ units: 2 }).warnings!.join(" ")).toMatch(/estabilizador/);
    expect(build().warnings!.join(" ")).not.toMatch(/estabilizador/);
    expect(build().warnings!.join(" ")).toMatch(/Haste MX com folga de 0,15 mm/);
    expect(() => build({ taper: 5 })).toThrow(/Topo estreito/);
    expect(() => build({ height: 6 })).toThrow(/baixa demais/);
  });
});
