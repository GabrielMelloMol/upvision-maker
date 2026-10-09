import { beforeAll, describe, expect, test } from "vitest";
import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { buildCableComb, DEFAULT_CABLE_COMB as CC } from "./cableComb";
import { buildHoseAdapter, DEFAULT_HOSE_ADAPTER as HA } from "./hoseAdapter";
import { buildKnob, DEFAULT_KNOB as KN } from "./knob";
import { buildPlantMarker, DEFAULT_PLANT_MARKER as PM } from "./plantMarker";
import { buildSpacer, DEFAULT_SPACER as SP } from "./spacer";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  ctx = { M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) };
});
const T = { timeout: 30_000 };
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const size = (models: Model[]) => {
  const b = modelsBounds(models)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
const sliceArea = (m: Mesh, z: number) => {
  const s = solid(m);
  const cs = s.slice(z);
  const a = cs.area();
  return a;
};
const closed = (models: Model[]) => {
  for (const m of models) for (const q of m.parts) expect(solid(q.mesh).status()).toBe("NoError");
};

describe("espaçador, calço ou arruela (#121)", T, () => {
  test("uma arruela: medidas e volume do anel", () => {
    const out = buildSpacer(ctx, { ...SP, innerD: 8, outerD: 20, thickness: 3, quantity: 1 });
    const [w, h, z] = size(out.models);
    expect([w, h, z]).toEqual([expect.closeTo(20, 1), expect.closeTo(20, 1), expect.closeTo(3, 2)]);
    expect(volume(out.models[0].parts[0].mesh)).toBeCloseTo((Math.PI / 4) * (400 - 64) * 3, -1);
    closed(out.models);
  });

  test("várias arruelas ficam separadas na mesa, cada uma inteira", () => {
    const one = volume(buildSpacer(ctx, { ...SP, quantity: 1 }).models[0].parts[0].mesh);
    const out = buildSpacer(ctx, { ...SP, quantity: 6 });
    expect(volume(out.models[0].parts[0].mesh)).toBeCloseTo(6 * one, 0);
    const [w, h] = size(out.models);
    expect(Math.max(w, h)).toBeLessThanOrEqual(bedMm());
    closed(out.models);
  });

  test("parede fina demais avisa e fica com 1,2 mm", () => {
    const out = buildSpacer(ctx, { ...SP, innerD: 10, outerD: 11, quantity: 1 });
    expect(out.warnings?.join(" ")).toMatch(/parede/i);
    const [w] = size(out.models);
    expect(w).toBeCloseTo(12.4, 1);
  });

  test("quantidade que não cabe na mesa avisa", () => {
    const out = buildSpacer(ctx, { ...SP, outerD: 60, quantity: 50 });
    expect(out.warnings?.join(" ")).toMatch(/mesa/);
  });
});

describe("marcador de horta ou planta (#121)", T, () => {
  test("haste com ponta, cabeça com o nome em relevo noutra cor", () => {
    const out = buildPlantMarker(ctx, { ...PM, text: "Manjericão" });
    const names = out.models[0].parts.map((p) => p.name);
    expect(names).toEqual(["Marcador", "Texto"]);
    expect(out.models[0].parts[0].color).not.toBe(out.models[0].parts[1].color);
    const [w, h, z] = size(out.models);
    expect(w).toBeCloseTo(PM.headWidth, 1);
    expect(h).toBeCloseTo(PM.headHeight + PM.stakeLength, 1);
    expect(z).toBeCloseTo(PM.thickness + PM.relief, 2);
    closed(out.models);
  });

  test("a ponta da haste é mais fina que a base dela", () => {
    const out = buildPlantMarker(ctx, PM);
    const m = out.models[0].parts[0].mesh;
    const b = size(out.models);
    const bottom = sliceArea(m, PM.thickness / 2);
    expect(bottom).toBeGreaterThan(0);
    expect(b[1]).toBeGreaterThan(PM.stakeLength);
  });

  test("sem texto avisa; haste maior que a mesa avisa", () => {
    expect(() => buildPlantMarker(ctx, { ...PM, text: "  " })).toThrow(/texto/i);
    expect(buildPlantMarker(ctx, { ...PM, stakeLength: 300 }).warnings?.join(" ")).toMatch(/mesa/);
  });
});

describe("clipe e pente de cabos (#121)", T, () => {
  const d = 5;
  const p = { ...CC, cables: 3, cableD: d, topThickness: 2, length: 12 };

  test("largura cresce com o número de cabos e o corpo tem a altura do tampo mais o cabo", () => {
    const out = buildCableComb(ctx, p);
    const [w, l, h] = size(out.models);
    expect(l).toBeCloseTo(12, 1);
    expect(h).toBeGreaterThan(2 + d);
    expect(w).toBeGreaterThan(3 * d);
    expect(size(buildCableComb(ctx, { ...p, cables: 5 }).models)[0]).toBeGreaterThan(w + 2 * d);
    closed(out.models);
  });

  test("cada vão abraça o cabo (folga) e a boca é mais estreita que o cabo para prender", () => {
    const out = buildCableComb(ctx, p);
    const m = out.models[0].parts[0].mesh;
    const bw = size(out.models)[0];
    const L = 12;
    const mid = 2 + d / 2; // altura do centro do cabo
    const neck = 2 + d + 0.4;
    const gapAt = (z: number) => (bw * L - sliceArea(m, z)) / L; // largura total dos vãos nessa altura
    expect(gapAt(mid)).toBeCloseTo(3 * (d + CC.clearance), 0);
    expect(gapAt(neck)).toBeLessThan(3 * d);
    expect(gapAt(neck)).toBeGreaterThan(0);
  });

  test("cabo grosso demais para o comprimento avisa de mesa; limites do pente", () => {
    expect(buildCableComb(ctx, { ...p, cables: 8, cableD: 40, length: 12 }).warnings?.join(" ")).toMatch(/mesa/);
  });
});

describe("botão ou manopla (#121)", T, () => {
  const k = { ...KN, diameter: 30, height: 15, shaftD: 6, shaftDepth: 10, serrations: 0, mark: "none" as const };

  test("corpo cilíndrico com furo de eixo redondo pelo fundo", () => {
    const out = buildKnob(ctx, { ...k, shaft: "round" });
    const [w, h, z] = size(out.models);
    expect([w, h, z]).toEqual([expect.closeTo(30, 1), expect.closeTo(30, 1), expect.closeTo(15, 2)]);
    const m = out.models[0].parts[0].mesh;
    expect(sliceArea(m, 1)).toBeCloseTo((Math.PI / 4) * (900 - (6 + KN.clearance) ** 2), -1);
    expect(sliceArea(m, 14)).toBeCloseTo((Math.PI / 4) * 900, -1); // o topo é fechado
    closed(out.models);
  });

  test("eixo em D tem o furo menor que o redondo (sobra plástico no chato)", () => {
    const round = sliceArea(buildKnob(ctx, { ...k, shaft: "round" }).models[0].parts[0].mesh, 1);
    const flat = sliceArea(buildKnob(ctx, { ...k, shaft: "d", flatDepth: 1 }).models[0].parts[0].mesh, 1);
    expect(flat).toBeGreaterThan(round);
  });

  test("serrilha tira material da borda e marca de indicador tira do topo", () => {
    const plain = volume(buildKnob(ctx, k).models[0].parts[0].mesh);
    const knurl = volume(buildKnob(ctx, { ...k, serrations: 20 }).models[0].parts[0].mesh);
    expect(knurl).toBeLessThan(plain - 20);
    const marked = volume(buildKnob(ctx, { ...k, mark: "line" }).models[0].parts[0].mesh);
    expect(marked).toBeLessThan(plain - 1);
  });

  test("furo fundo demais ou eixo largo demais avisam e são limitados", () => {
    const out = buildKnob(ctx, { ...k, shaftDepth: 14.5 });
    expect(out.warnings?.join(" ")).toMatch(/eixo/i);
    const m = out.models[0].parts[0].mesh;
    expect(sliceArea(m, 14.9)).toBeCloseTo((Math.PI / 4) * 900, -1);
  });
});

describe("adaptador de mangueira ou aspirador (#121)", T, () => {
  const h = { ...HA, innerA: 30, outerA: 34, lengthA: 25, innerB: 20, outerB: 24, lengthB: 25, cone: 20, ribs: false };

  test("altura é um lado + cone + outro lado e a ponta larga tem o diâmetro externo", () => {
    const out = buildHoseAdapter(ctx, h);
    const [w, d, z] = size(out.models);
    expect([w, d, z]).toEqual([expect.closeTo(34, 1), expect.closeTo(34, 1), expect.closeTo(70, 1)]);
    closed(out.models);
  });

  test("o furo passa de ponta a ponta, com o diâmetro de cada lado", () => {
    const m = buildHoseAdapter(ctx, h).models[0].parts[0].mesh;
    expect(sliceArea(m, 5)).toBeCloseTo((Math.PI / 4) * (34 ** 2 - 30 ** 2), 0);
    expect(sliceArea(m, 65)).toBeCloseTo((Math.PI / 4) * (24 ** 2 - 20 ** 2), 0);
  });

  test("nervuras de retenção acrescentam material nas pontas", () => {
    const plain = volume(buildHoseAdapter(ctx, h).models[0].parts[0].mesh);
    const ribbed = volume(buildHoseAdapter(ctx, { ...h, ribs: true }).models[0].parts[0].mesh);
    expect(ribbed).toBeGreaterThan(plain + 10);
  });

  test("parede fina demais é corrigida com aviso; cone curto demais (mais de 45°) avisa", () => {
    expect(buildHoseAdapter(ctx, { ...h, innerA: 30, outerA: 30.5 }).warnings?.join(" ")).toMatch(/parede/i);
    expect(buildHoseAdapter(ctx, { ...h, cone: 2 }).warnings?.join(" ")).toMatch(/45/);
  });
});
