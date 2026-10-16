import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildDrillJig, buildLabelJig, buildRadiusGauge, DEFAULT_DRILL_JIG, DEFAULT_LABEL_JIG, DEFAULT_RADIUS_GAUGE, parseRadii, type DrillJigParams, type LabelJigParams, type RadiusGaugeParams } from "./jigs";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const mesh = (o: { models: { parts: { mesh: Mesh }[] }[] }) => o.models[0].parts[0].mesh;
const drill = (p: Partial<DrillJigParams> = {}) => buildDrillJig(ctx(), { ...DEFAULT_DRILL_JIG, ...p });
const radius = (p: Partial<RadiusGaugeParams> = {}) => buildRadiusGauge(ctx(), { ...DEFAULT_RADIUS_GAUGE, ...p });
const label = (p: Partial<LabelJigParams> = {}) => buildLabelJig(ctx(), { ...DEFAULT_LABEL_JIG, ...p });

describe("gabarito de furação (#235)", { timeout: 60_000 }, () => {
  test("a broca passa pelos furos (broca + folga), cada furo na distância e no espaçamento pedidos", () => {
    const p = DEFAULT_DRILL_JIG;
    const s = solid(mesh(drill()));
    const rod = (x: number, d: number) => M.Manifold.cylinder(60, d / 2, d / 2, 48).translate([x, p.edgeDist, -10]);
    for (let i = 0; i < p.holes; i++) {
      const x = (i - (p.holes - 1) / 2) * p.pitch;
      const free = rod(x, p.drillD + 0.1), tight = rod(x, p.drillD + p.clearance + 0.6);
      expect(s.intersect(free).volume(), `furo ${i} livre`).toBeLessThan(0.01);
      expect(s.intersect(tight).volume(), `furo ${i} guia`).toBeGreaterThan(5);
      [free, tight].forEach((o) => o.delete());
    }
    s.delete();
  });

  test("o batente passa da face de cima, a peça é uma só e os furos atravessam o batente", () => {
    const p = DEFAULT_DRILL_JIG;
    const out = drill();
    const b = meshBounds([mesh(out)])!;
    expect(b.max[2]).toBeCloseTo(p.thickness + 6, 2);
    expect(meshBounds([mesh(drill({ lip: false }))])!.max[2]).toBeCloseTo(p.thickness, 2);
    const s = solid(mesh(out));
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("avisos: furos juntos, perto da borda, gabarito fino e maior que a mesa", () => {
    expect(drill({ pitch: 6 }).warnings?.join(" ")).toMatch(/muito perto uns dos outros/);
    expect(drill({ edgeDist: 3 }).warnings?.join(" ")).toMatch(/perto demais da borda/);
    expect(drill({ thickness: 3 }).warnings?.join(" ")).toMatch(/mais fino que a broca/);
    expect(drill({ holes: 10, pitch: 100 }).warnings?.join(" ")).toMatch(/passa da mesa/);
    expect(drill().warnings).toEqual([]);
  });
});

describe("gabarito de raios (#235)", { timeout: 60_000 }, () => {
  test("lista de raios: ponto nos decimais, ordena, tira repetidos e marca o que não é número", () => {
    expect(parseRadii("5, 1.5; 2 2 abc 0 99")).toEqual({ radii: [1.5, 2, 5], bad: ["abc", "0", "99"] });
  });

  test("cada lâmina tem o entalhe de raio R (a ponta redonda de raio R encaixa nele) e a peça é uma só", () => {
    const out = radius({ radii: "5" });
    const s = solid(mesh(out));
    expect(s.decompose().length).toBe(1);
    const b = meshBounds([mesh(out)])!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(DEFAULT_RADIUS_GAUGE.thickness, 2);
    // o entalhe de 5 mm: um cilindro de raio 5 no centro do topo da lâmina está vazio (a peça de raio 5 entra)
    const probe = M.Manifold.cylinder(6, 4.9, 4.9, 48).translate([7 + 13, 5 + 13, -2]); // centro do entalhe (x = espinha + meia lâmina, y = R + altura da lâmina)
    const free = s.intersect(probe);
    expect(free.volume()).toBeLessThan(0.05);
    [s, probe, free].forEach((o) => o.delete());
  });

  test("mais raios, gabarito mais comprido; o valor fica gravado (tira material); avisos de raio ruim e de tamanho", () => {
    const few = meshBounds([mesh(radius({ radii: "2, 3" }))])!, many = meshBounds([mesh(radius({ radii: "2, 3, 5, 8" }))])!;
    expect(many.max[1] - many.min[1]).toBeGreaterThan(few.max[1] - few.min[1] + 30);
    expect(radius({ radii: "2, x" }).warnings?.join(" ")).toMatch(/Raio ignorado/);
    expect(radius({ radii: "20, 25, 30, 35, 40, 38, 36, 34, 32, 30.5, 29, 27, 26, 24, 22" }).warnings?.join(" ")).toMatch(/passa da mesa/);
    expect(() => radius({ radii: "x" })).toThrow(/pelo menos um raio/);
  });
});

describe("gabarito de etiqueta (#235)", { timeout: 60_000 }, () => {
  test("a janela tem o tamanho da etiqueta mais a folga; a moldura tem a largura de borda pedida", () => {
    const p = DEFAULT_LABEL_JIG;
    const s = solid(mesh(label()));
    const win = M.Manifold.cube([p.labelW + 0.2, p.labelH + 0.2, 1], true).translate([0, 0, p.thickness / 2]);
    const b = meshBounds([mesh(label())])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(p.labelW + 0.4 + 2 * p.rim, 1);
    // o centro da janela está vazio e logo depois da janela há moldura
    const c = s.slice(p.thickness / 2);
    expect(c.area()).toBeLessThan((p.labelW + 0.4 + 2 * p.rim) * (p.labelH + 0.4 + 2 * p.rim) - p.labelW * p.labelH);
    [s, win, c].forEach((o) => o.delete());
  });

  test("avisa quando passa da mesa", () => {
    expect(label({ labelW: 250 }).warnings?.join(" ")).toMatch(/passa da mesa/);
    expect(label().warnings).toEqual([]);
  });
});
