import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { modelVolume, volume } from "../testUtil";
import { buildCoaster, DEFAULT_COASTER as D, type CoasterParams } from "./coaster";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: o texto vira um bloco 0,5·h × h por letra, na largura certa. */
const ctx = (art: ModelCtx["art"] = null, layers: ModelCtx["artLayers"] = null): ModelCtx => ({ M, art, artLayers: layers, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const build = (p: Partial<CoasterParams> = {}, c: ModelCtx = ctx()) => buildCoaster(c, { ...D, ...p });
const polygonArea = (n: number, r: number) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);

describe("porta-copos (#109)", { timeout: 60_000 }, () => {
  test("redondo: o diâmetro pedido, apoiado na mesa, na espessura pedida", () => {
    const { models } = build({ shape: "round", size: 90, borderWidth: 0 });
    const b = modelsBounds(models)!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(90, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(90, 1);
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(D.thickness, 3);
  });

  test("quadrado e hexágono: lado e largura entre lados pedidos", () => {
    const sq = modelsBounds(build({ shape: "square", size: 80, corner: 0, borderWidth: 0 }).models)!;
    expect([sq.max[0] - sq.min[0], sq.max[1] - sq.min[1]]).toEqual([expect.closeTo(80, 1), expect.closeTo(80, 1)]);
    const hx = modelsBounds(build({ shape: "hex", size: 80, corner: 0, borderWidth: 0 }).models)!;
    expect(hx.max[1] - hx.min[1]).toBeCloseTo(80, 1); // entre lados
    expect(hx.max[0] - hx.min[0]).toBeCloseTo((80 * 2) / Math.sqrt(3), 1); // entre cantos
  });

  test("o corpo e o desenho juntos fecham a peça: sem sobrepor, rente (volume = área × espessura)", () => {
    const { models } = build({ shape: "round", size: 90, feet: false });
    const r = 45;
    expect(modelVolume(models[0])).toBeCloseTo(polygonArea(128, r) * D.thickness, -1);
    const sq = build({ shape: "square", size: 80, corner: 0 }).models[0];
    expect(modelVolume(sq)).toBeCloseTo(80 * 80 * D.thickness, -1);
  });

  test("o desenho fica na face de baixo (na mesa, lisa) e entra só a profundidade pedida", () => {
    const { models } = build({ depth: 0.8 });
    const ink = models[0].parts.find((p) => p.name === "Nome")!;
    const b = meshBounds([ink.mesh])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(0.8, 3);
    expect(models[0].parts[0].color).not.toBe(ink.color);
  });

  test("desenho para cima (desligando 'para baixo'): o desenho fica na face de cima, os pés no fundo e sem aviso de virar", () => {
    const { models, warnings } = build({ faceDown: false, feet: true });
    const ink = models[0].parts.find((p) => p.name === "Nome")!;
    const b = meshBounds([ink.mesh])!;
    expect(b.min[2]).toBeCloseTo(D.thickness - D.depth, 3);
    expect(b.max[2]).toBeCloseTo(D.thickness, 3);
    expect(warnings!.join(" ")).not.toMatch(/desenho fica para baixo/);
    // os pés agora são rebaixos no fundo (lado da mesa)
    const body = models[0].parts[0];
    const down = build({ faceDown: true, feet: true }).models[0].parts[0];
    expect(volume(body.mesh)).toBeCloseTo(volume(down.mesh), 3);
  });

  test("o nome lê certo depois de virar: um nome mais pesado à direita fica à direita, e o que estava embaixo vai para cima na impressão", () => {
    const right = (s: string, h: number): ReturnType<ModelCtx["text"]> =>
      s.trim() ? M.CrossSection.union([M.CrossSection.square([h * 0.1, h * 0.2], true).translate([-h * 0.9, 0]), M.CrossSection.square([h * 0.8, h * 0.2], true).translate([h * 0.4, -h * 0.4])]) : null;
    const asym: ModelCtx = { M, art: null, text: right };
    const { models } = buildCoaster(asym, { ...D, borderWidth: 0 });
    const ink = models[0].parts.find((p) => p.name === "Nome")!;
    const solid = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: ink.mesh.positions, triVerts: ink.mesh.indices }));
    const share = (half: [number, number, number], at: [number, number, number]) => {
      const h = M.Manifold.cube(half).translate(at);
      const part = solid.intersect(h);
      const v = part.volume() / solid.volume();
      [h, part].forEach((o) => o.delete());
      return v;
    };
    const onRight = share([100, 200, 50], [0, -100, -10]); // x > 0
    const onTop = share([200, 100, 50], [-100, 0, -10]); // y > 0
    solid.delete();
    expect(onRight).toBeGreaterThan(0.6); // x não espelha (o giro é em volta do eixo X)
    expect(onTop).toBeGreaterThan(0.6); // y inverte: o bloco pesado que estava embaixo (y < 0) vai para cima na impressão
  });

  test("anel decorativo rente na cor do desenho: largura e distância da borda", () => {
    const withRing = build({ shape: "round", size: 90, borderWidth: 2 }).models[0];
    const without = build({ shape: "round", size: 90, borderWidth: 0 }).models[0];
    const ink = (m: typeof withRing) => volume(m.parts.find((p) => p.name === "Nome")!.mesh);
    // área do anel entre os raios 45−3−2 = 40 e 42 (aproximado por polígono de 128 lados)
    expect(ink(withRing) - ink(without)).toBeCloseTo((polygonArea(128, 42) - polygonArea(128, 40)) * D.depth, 0);
  });

  test("pés de silicone: 4 rebaixos de 8 mm no lado de cima da impressão (sem suporte), sem tocar a borda", () => {
    const base = build({ feet: false }).models[0].parts[0];
    const feet = build({ feet: true }).models[0].parts[0];
    expect(volume(base.mesh) - volume(feet.mesh)).toBeCloseTo(4 * polygonArea(32, 4) * 1.2, 1); // 4 cilindros de 8 mm (32 lados) e 1,2 mm de fundo
    const fb = meshBounds([feet.mesh])!;
    expect(fb.max[2]).toBeCloseTo(D.thickness, 3);
    const P = feet.mesh.positions;
    let rmax = 0;
    for (let i = 0; i < P.length; i += 3) rmax = Math.max(rmax, Math.hypot(P[i], P[i + 1]));
    expect(rmax).toBeLessThanOrEqual(45 + 1e-3); // nada passa do raio do porta-copos
  });

  test("suporte: 1 modelo a mais com N fendas da espessura + folga, ao lado, sem sobrepor e o conjunto centrado", () => {
    const one = build({ stand: 0 });
    expect(one.models).toHaveLength(1);
    const { models } = build({ stand: 4 });
    expect(models.map((m) => m.name)).toEqual(["Porta-copos", "Suporte"]);
    const [c, s] = models.map((m) => modelsBounds([m])!);
    expect(s.min[0]).toBeGreaterThan(c.max[0]);
    const all = modelsBounds(models)!;
    expect((all.min[0] + all.max[0]) / 2).toBeCloseTo(0, 1);
    // 4 fendas de (4,5 + 1) mm, 5 paredes de 3 mm
    expect(s.max[0] - s.min[0]).toBeCloseTo(4 * 5.5 + 5 * 3, 1);
    expect(s.min[2]).toBeCloseTo(0, 3);
    // volume = bloco − 4 fendas
    const L = 4 * 5.5 + 15;
    const W = 90 + 1.5 + 6;
    const H = 90 * 0.3 + 3;
    const slot = 5.5 * 91.5 * 27;
    expect(modelVolume(models[1])).toBeCloseTo(L * W * H - 4 * slot, -1);
    expect(build({ stand: 99 }).models[1]).toBeDefined(); // limitado a 6
    expect(modelsBounds([build({ stand: 99 }).models[1]])!.max[0] - modelsBounds([build({ stand: 99 }).models[1]])!.min[0]).toBeCloseTo(6 * 5.5 + 7 * 3, 1);
  });

  test("forma pelo desenho: o contorno vem do SVG; sem desenho pede o desenho", () => {
    const art = M.CrossSection.square([30, 20], true);
    const { models } = build({ shape: "svg", size: 80, borderWidth: 0 }, ctx(art));
    const b = modelsBounds(models)!;
    expect(b.max[0] - b.min[0]).toBeGreaterThan(70);
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(80.01);
    expect(b.max[1] - b.min[1]).toBeLessThan(b.max[0] - b.min[0]); // segue a proporção do desenho
    expect(() => build({ shape: "svg" })).toThrow("Envie um desenho");
  });

  test("arte na face: uma parte 'Arte' (ou uma por cor, mais a borda); sem desenho pede o desenho", () => {
    const art = M.CrossSection.circle(10, 24);
    expect(build({ content: "art" }, ctx(art)).models[0].parts.map((p) => p.name)).toEqual(["Porta-copos", "Arte"]);
    const layers = [{ color: "#ff0000", cs: M.CrossSection.square([10, 20], true).translate([-5, 0]) }, { color: "#0000ff", cs: M.CrossSection.square([10, 20], true).translate([5, 0]) }];
    const names = build({ content: "art" }, ctx(M.CrossSection.square([20, 20], true), layers)).models[0].parts.map((p) => p.name);
    expect(names).toEqual(["Porta-copos", "Arte 1", "Arte 2", "Borda"]);
    expect(() => build({ content: "art" })).toThrow("Envie um desenho");
  });

  test("sem nome nem anel: porta-copos liso; avisos de PETG e de mesa", () => {
    const plain = build({ text: "", borderWidth: 0 });
    expect(plain.models[0].parts).toHaveLength(1);
    expect(plain.warnings!.join(" ")).toMatch(/PETG/);
    expect(plain.warnings!.join(" ")).toMatch(/desenho fica para baixo/);
    expect(build({ size: 300 }).warnings!.join(" ")).toMatch(/passa da mesa/);
  });
});
