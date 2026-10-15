import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import { meshBounds } from "../bounds";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildDumbbell, buildKettlebell, DEFAULT_DUMBBELL, DEFAULT_KETTLEBELL } from "./gymWeights";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";

const FONT_FILE = "anton-400.ttf";
let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", FONT_FILE));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("halter (#213)", () => {
  test("anilhas, barra com argola e texto: partes fechadas, deitadas na mesa, sem se sobrepor", () => {
    const { models } = buildDumbbell(ctx, DEFAULT_DUMBBELL);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Anilhas", "Barra", "Texto"]);
    const solids = models[0].parts.map((p) => solid(p.mesh));
    solids.forEach((s) => expect(s.status()).toBe("NoError"));
    expect(solids[0].intersect(solids[1]).volume()).toBeCloseTo(0, 3);
    expect(solids[1].intersect(solids[2]).volume()).toBeCloseTo(0, 3); // o texto fica sobre a barra
    const b = meshBounds(models[0].parts.map((p) => p.mesh))!;
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[0] - b.min[0]).toBeCloseTo(DEFAULT_DUMBBELL.length, 1);
    expect(b.max[2]).toBeCloseTo(DEFAULT_DUMBBELL.thickness + DEFAULT_DUMBBELL.relief, 3);
  });

  test("a barra é uma peça só com a argola, que tem furo de verdade e fica dentro da altura das anilhas", () => {
    const bar = solid(buildDumbbell(ctx, DEFAULT_DUMBBELL).models[0].parts[1].mesh);
    expect(bar.decompose()).toHaveLength(1);
    expect(bar.genus()).toBe(1); // o furo da argola
    const b = bar.boundingBox();
    expect(b.max[1]).toBeLessThan(DEFAULT_DUMBBELL.plateH / 2);
  });

  test("as anilhas descem em degraus de fora para dentro e são simétricas", () => {
    const plates = solid(buildDumbbell(ctx, DEFAULT_DUMBBELL).models[0].parts[0].mesh);
    expect(plates.decompose()).toHaveLength(2); // uma pilha de cada lado
    const [a, b] = plates.decompose().map((s) => s.boundingBox());
    expect(a.max[1] - a.min[1]).toBeCloseTo(DEFAULT_DUMBBELL.plateH, 2);
    expect(Math.abs(a.max[0] + b.min[0] + (a.min[0] + b.max[0]))).toBeLessThan(1e-3);
  });

  test("sem texto sai só com as duas partes", () => {
    const noText = { ...ctx, text: () => null };
    expect(buildDumbbell(noText, DEFAULT_DUMBBELL).models[0].parts.map((p) => p.name)).toEqual(["Anilhas", "Barra"]);
  });
});

describe("kettlebell (#213)", () => {
  test("corpo com a alça vazada e texto: fechados, a janela da alça é maior que a argola de chaveiro", () => {
    const { models } = buildKettlebell(ctx, DEFAULT_KETTLEBELL);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Kettlebell", "Texto"]);
    const body = solid(models[0].parts[0].mesh);
    expect(body.status()).toBe("NoError");
    expect(body.decompose()).toHaveLength(1);
    expect(body.genus()).toBe(1); // a janela da alça
    expect(body.intersect(solid(models[0].parts[1].mesh)).volume()).toBeCloseTo(0, 3);
    // a janela deixa passar uma argola de 5 mm: cabe um cilindro de 5 mm no meio da janela
    const r = DEFAULT_KETTLEBELL.diameter / 2;
    const ring = M.Manifold.cylinder(DEFAULT_KETTLEBELL.thickness * 3, 2.5, 2.5, 24).translate([0, r * 1.2, -4]);
    expect(body.intersect(ring).volume()).toBeCloseTo(0, 3);
  });

  test("a base é achatada: o corpo não passa abaixo da linha de apoio", () => {
    const b = meshBounds(buildKettlebell(ctx, DEFAULT_KETTLEBELL).models[0].parts.map((p) => p.mesh))!;
    expect(b.min[1]).toBeCloseTo(-0.9 * DEFAULT_KETTLEBELL.diameter / 2, 1);
    expect(b.min[2]).toBeCloseTo(0, 6);
  });
});
