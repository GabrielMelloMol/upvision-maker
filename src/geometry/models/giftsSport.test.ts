import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type CS, type ManifoldToplevel, type Solid } from "../manifold";
import { sq, volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import { buildAdaptiveMedal, DEFAULT_ADAPTIVE_MEDAL } from "./adaptiveMedal";
import { buildAdaptiveTrophy, DEFAULT_ADAPTIVE_TROPHY } from "./adaptiveTrophy";
import { buildArticulatedName, DEFAULT_ARTICULATED } from "./articulatedName";
import { buildClicker, DEFAULT_CLICKER } from "./clicker";
import { buildColoringTile, DEFAULT_COLORING_TILE } from "./coloringTile";
import { MissingInput, type ModelCtx } from "./common";
import { buildGymKeychain, DEFAULT_GYM_KEYCHAIN } from "./gymKeychain";
import { buildKeyHolder, DEFAULT_KEY_HOLDER } from "./keyHolder";
import { buildLamp, DEFAULT_LAMP } from "./lamp";
import { buildMolleTag, DEFAULT_MOLLE_TAG } from "./molleTag";
import { buildNfcJewelry, DEFAULT_NFC_JEWELRY } from "./nfcJewelry";
import { buildNfcTotem, DEFAULT_NFC_TOTEM } from "./nfcTotem";
import { buildOpener, DEFAULT_OPENER } from "./opener";
import { buildTrophy, DEFAULT_TROPHY } from "./trophy";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: CS | null = null): ModelCtx => ({
  M,
  art,
  artLayers: null,
  text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null),
});
const square = () => new M.CrossSection([sq(10)], "NonZero");
const b = (m: Mesh) => meshBounds([m])!;
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const p of m.parts) {
      const s = solid(p.mesh);
      expect(s.status()).toBe("NoError");
      expect(volume(p.mesh)).toBeGreaterThan(0);
      expect(b(p.mesh).min[2]).toBeGreaterThanOrEqual(-1e-4);
    }
}

describe("esporte", () => {
  test("medalha adaptável: corpo no contorno + alça com rasgo da fita no topo", () => {
    const { models } = buildAdaptiveMedal(ctx(square()), DEFAULT_ADAPTIVE_MEDAL);
    expectPrintable(models);
    const body = solid(models[0].parts[0].mesh);
    const top = b(models[0].parts[0].mesh).max[1];
    // uma fita (menor que o rasgo) passa pela alça sem bater
    const ribbon = M.Manifold.cube([DEFAULT_ADAPTIVE_MEDAL.ribbon - 1, 2, 20], true).translate([0, top - 6, 0]);
    expect(body.intersect(ribbon).volume()).toBeCloseTo(0, 2);
  });

  test("troféu adaptável: lingueta cabe no rasgo da base (compacta e original)", () => {
    for (const compact of [true, false]) {
      const { models } = buildAdaptiveTrophy(ctx(square()), { ...DEFAULT_ADAPTIVE_TROPHY, compact });
      expectPrintable(models);
      const base = b(models[1].parts[0].mesh);
      if (compact) expect([base.max[0] - base.min[0], base.max[1] - base.min[1]]).toEqual([expect.closeTo(120, 1), expect.closeTo(55, 1)]);
      expect(models[1].parts.map((p) => p.name)).toEqual(["Base", "Texto da base"]);
    }
  });

  test("troféu elegante: 2 linhas de texto na base", () => {
    const one = buildTrophy(ctx(), { ...DEFAULT_TROPHY, baseText: "A" }).models[1].parts[1].mesh;
    const two = buildTrophy(ctx(), { ...DEFAULT_TROPHY, baseText: "A", baseText2: "B" }).models[1].parts[1].mesh;
    expect(b(two).max[2] - b(two).min[2]).toBeGreaterThan(b(one).max[2] - b(one).min[2]); // ocupa mais altura
  });

  test("chaveiro anilha: sem arte usa o texto; com arte, arte dentro do aro", () => {
    expectPrintable(buildGymKeychain(ctx(), DEFAULT_GYM_KEYCHAIN).models);
    const { models } = buildGymKeychain(ctx(square()), DEFAULT_GYM_KEYCHAIN);
    const art = b(models[0].parts[2].mesh);
    expect(Math.hypot(art.max[0], art.max[1])).toBeLessThan(DEFAULT_GYM_KEYCHAIN.diameter / 2);
  });
});

describe("brindes e peças funcionais", () => {
  test("MOLLE tag: 118 × 72 com 4 rasgos da largura pedida", () => {
    const { models } = buildMolleTag(ctx(), DEFAULT_MOLLE_TAG);
    expectPrintable(models);
    const plate = models[0].parts[0].mesh;
    const pb = b(plate);
    expect([pb.max[0] - pb.min[0], pb.max[1] - pb.min[1]]).toEqual([expect.closeTo(118, 1), expect.closeTo(72, 1)]);
    const full = 118 * 72 * DEFAULT_MOLLE_TAG.thickness;
    expect(full - volume(plate)).toBeGreaterThan(4 * DEFAULT_MOLLE_TAG.strap * 20 * DEFAULT_MOLLE_TAG.thickness);
  });

  test("plaquinha de colorir: traços acima da placa nos dois modos", () => {
    for (const mode of ["outline", "lines"] as const) {
      const { models } = buildColoringTile(ctx(square()), { ...DEFAULT_COLORING_TILE, mode });
      expectPrintable(models);
      expect(b(models[0].parts[1].mesh).max[2]).toBeCloseTo(DEFAULT_COLORING_TILE.thickness + DEFAULT_COLORING_TILE.wall);
    }
  });

  test("abridor de garrafa tem o furo; de lata, a ponta afina até 2,2 mm", () => {
    const bottle = buildOpener(ctx(), DEFAULT_OPENER).models[0].parts[0].mesh;
    const can = buildOpener(ctx(), { ...DEFAULT_OPENER, kind: "can" }).models[0].parts[0].mesh;
    expectPrintable([{ name: "a", parts: [{ name: "a", color: "#000", mesh: bottle }, { name: "b", color: "#000", mesh: can }] }]);
    expect(solid(bottle).genus()).toBeGreaterThanOrEqual(2); // argola + furo da tampinha
    const tip = solid(can).trimByPlane([1, 0, 0], b(can).max[0] - 1);
    expect(tip.boundingBox().max[2]).toBeLessThan(3);
  });

  test("clicker: chapa com o recorte da chave e tecla com a cruz", () => {
    const { models } = buildClicker(ctx(square()), DEFAULT_CLICKER);
    expectPrintable(models);
    const body = solid(models[0].parts[0].mesh);
    const bb = body.boundingBox();
    // uma chave de 13,9 mm passa pelo recorte da chapa
    const sw = M.Manifold.cube([13.9, 13.9, 3], true).translate([0, 0, bb.max[2] - 0.5]);
    expect(body.intersect(sw).volume()).toBeCloseTo(0, 2);
    expect(models[1].parts.map((p) => p.name)).toEqual(["Tecla", "Arte"]);
  });

  test("porta-chave: um gancho por pedido e painel com furos de parafuso", () => {
    const { models } = buildKeyHolder(ctx(square()), { ...DEFAULT_KEY_HOLDER, hooks: 3 });
    expectPrintable(models);
    expect(b(models[0].parts[0].mesh).max[2]).toBeCloseTo(DEFAULT_KEY_HOLDER.hookDepth);
    expect(solid(models[0].parts[0].mesh).genus()).toBe(2);
  });

  test("luminária: difusor fino por baixo, caixa oca e tampa que cabe dentro", () => {
    const { models } = buildLamp(ctx(), DEFAULT_LAMP);
    expectPrintable(models);
    const [diff, box] = models[0].parts;
    expect(b(diff.mesh).max[2]).toBeCloseTo(0.8);
    expect(b(box.mesh).max[2]).toBeCloseTo(DEFAULT_LAMP.depth);
    const lid = b(models[1].parts[0].mesh);
    expect(lid.max[0] - lid.min[0]).toBeCloseTo(b(box.mesh).max[0] - b(box.mesh).min[0], 0);
    expect(() => buildLamp(ctx(), { ...DEFAULT_LAMP, text: "" })).toThrow(MissingInput);
  });

  test("porta-joia e totem NFC: bolsão da tag e pausa logo acima dele", () => {
    const j = buildNfcJewelry(ctx(), DEFAULT_NFC_JEWELRY);
    expectPrintable(j.models);
    expect(j.pauses).toEqual([2]);
    const t = buildNfcTotem(ctx(square()), DEFAULT_NFC_TOTEM);
    expectPrintable(t.models);
    expect(t.pauses).toEqual([2]);
    // a tag (disco de 25 × 0,8) cabe dentro do bolsão da placa do totem, sem encostar
    const plate = solid(t.models[0].parts[0].mesh);
    const tagY = -DEFAULT_NFC_TOTEM.height / 2 + 6 + (DEFAULT_NFC_TOTEM.tagDiameter + 1.5) / 2 + 4;
    const tag = M.Manifold.cylinder(0.8, 12.5, 12.5, 48).translate([0, tagY, 0.85]);
    expect(plate.intersect(tag).volume()).toBeCloseTo(0, 3);
    expect(plate.intersect(tag.translate([0, 0, -0.5])).volume()).toBeGreaterThan(1); // e o fundo existe
    expect(() => buildNfcJewelry(ctx(), { ...DEFAULT_NFC_JEWELRY, diameter: 30 })).toThrow(/pelo menos/);
  });

  test("nome articulado: uma peça por letra, presas pelas dobradiças (não soltam em nenhuma direção)", () => {
    const { models } = buildArticulatedName(ctx(), { ...DEFAULT_ARTICULATED, text: "ABC" });
    expectPrintable(models);
    const pieces = solid(models[0].parts[0].mesh).decompose();
    expect(pieces).toHaveLength(3);
    pieces.sort((a, c) => a.boundingBox().min[0] - c.boundingBox().min[0]);
    const [a, bb] = pieces;
    expect(a.intersect(bb).volume()).toBeCloseTo(0, 3); // folga: não se tocam
    // deslocar a 1ª peça 1 mm para cima, para baixo ou para a esquerda faz bater na 2ª: estão presas
    for (const d of [[0, 0, 1], [0, 0, -1], [-1.2, 0, 0]] as [number, number, number][]) expect(a.translate(d).intersect(bb).volume()).toBeGreaterThan(0.01);
  });
});
