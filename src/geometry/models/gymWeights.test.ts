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
  test("anilhas, barra e texto: partes fechadas, deitadas na mesa, sem se sobrepor", () => {
    const { models } = buildDumbbell(ctx, DEFAULT_DUMBBELL);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Anilhas", "Barra", "Texto"]);
    const solids = models[0].parts.map((p) => solid(p.mesh));
    solids.forEach((s) => expect(s.status()).toBe("NoError"));
    expect(solids[0].intersect(solids[1]).volume()).toBeCloseTo(0, 3);
    expect(solids[1].intersect(solids[2]).volume()).toBeCloseTo(0, 3); // o texto fica sobre a barra
    const b = meshBounds(models[0].parts.map((p) => p.mesh))!;
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(DEFAULT_DUMBBELL.thickness + DEFAULT_DUMBBELL.relief, 3);
  });

  test("a argola é uma orelha na ponta, longe do texto: tem furo de verdade e o texto não chega nela", () => {
    const { models } = buildDumbbell(ctx, DEFAULT_DUMBBELL);
    const plates = solid(models[0].parts[0].mesh);
    expect(plates.decompose().map((x) => x.genus()).sort()).toEqual([0, 1]); // só o furo da orelha, no lado direito
    const text = meshBounds([models[0].parts[2].mesh])!;
    const pb = plates.boundingBox();
    expect(pb.max[0]).toBeGreaterThan(DEFAULT_DUMBBELL.length / 2 + 4); // a orelha passa da ponta
    expect(text.max[0]).toBeLessThan(DEFAULT_DUMBBELL.length / 2 - 8); // o texto fica na barra, bem antes da ponta
    // o furo deixa passar uma argola de 3 mm
    const ring = M.Manifold.cylinder(30, 1.5, 1.5, 24).translate([DEFAULT_DUMBBELL.length / 2 + 2.8, 0, -5]);
    expect(plates.intersect(ring).volume()).toBeCloseTo(0, 3);
  });

  test("o texto fica centrado na barra", () => {
    const text = meshBounds([buildDumbbell(ctx, DEFAULT_DUMBBELL).models[0].parts[2].mesh])!;
    expect((text.min[0] + text.max[0]) / 2).toBeCloseTo(0, 1);
    expect((text.min[1] + text.max[1]) / 2).toBeCloseTo(0, 1);
  });

  test("duas anilhas por lado: a tampa de fora é menor que a de dentro, com a fresta entre elas, e os dois lados são iguais", () => {
    const plates = solid(buildDumbbell(ctx, DEFAULT_DUMBBELL).models[0].parts[0].mesh);
    const pieces = plates.decompose().map((s) => s.boundingBox());
    expect(pieces).toHaveLength(2);
    const [a, b] = pieces[0].min[0] < pieces[1].min[0] ? pieces : [pieces[1], pieces[0]];
    // o lado esquerdo tem a altura da anilha grande; a orelha só entra do lado direito
    expect(a.max[1] - a.min[1]).toBeCloseTo(DEFAULT_DUMBBELL.plateH, 2);
    expect(b.max[1] - b.min[1]).toBeCloseTo(DEFAULT_DUMBBELL.plateH, 2);
    // a fresta: uma sonda fina na altura de cima da tampa, rente à fresta, não toca em nada
    const L = DEFAULT_DUMBBELL.length;
    const gapX = -L / 2 + L * 0.075 + 0.3; // meio da fresta do lado esquerdo
    const probe = M.Manifold.cube([0.2, 4, 6], true).translate([gapX, DEFAULT_DUMBBELL.plateH * 0.45, DEFAULT_DUMBBELL.thickness / 2]);
    expect(plates.intersect(probe).volume()).toBeCloseTo(0, 3);
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
