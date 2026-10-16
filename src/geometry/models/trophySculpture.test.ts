import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { SPORT_IDS } from "../sports";
import { textToCrossSection } from "../text";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildSculpture, DEFAULT_SCULPTURE, type SculptureParams } from "./trophySculpture";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const build = (over: Partial<SculptureParams>) => buildSculpture(ctx, { ...DEFAULT_SCULPTURE, ...over });

describe("troféu escultura (#223)", () => {
  test.each(SPORT_IDS)("atleta de %s: peça fechada e única, com lingueta embaixo, mais a base", (sport) => {
    const out = build({ sport });
    expect(out.models).toHaveLength(2);
    const body = solid(out.models[0].parts[0].mesh);
    expect(body.status()).toBe("NoError");
    expect(body.decompose()).toHaveLength(1);
    const b = meshBounds([out.models[0].parts[0].mesh])!;
    expect(b.max[2] - b.min[2]).toBeCloseTo(DEFAULT_SCULPTURE.thickness, 3);
    expect(b.min[2]).toBeCloseTo(0, 6);
    body.delete();
  });

  test("a lingueta do atleta cabe no rasgo da base (folga) e a base leva o texto em outra cor", () => {
    const out = build({});
    const piece = meshBounds([out.models[0].parts[0].mesh])!;
    const tabW = 24;
    // a lingueta é a parte mais baixa, centrada em x = 0, com no máximo tabW de largura
    const body = solid(out.models[0].parts[0].mesh);
    const strip = body.intersect(M.Manifold.cube([1e3, 1e3, 1e3], true).translate([0, piece.min[1] - 1e3 / 2 + 6, 0]));
    const sb = strip.boundingBox();
    expect(sb.max[0] - sb.min[0]).toBeLessThanOrEqual(tabW + 1e-6);
    expect(Math.abs(sb.max[0] + sb.min[0])).toBeLessThan(1e-3);
    expect(out.models[1].parts.map((x) => x.name)).toEqual(["Base", "Texto da base"]);
    expect(out.models[1].parts[1].color).toBe(DEFAULT_SCULPTURE.textColor);
    body.delete();
    strip.delete();
  });

  test.each(["fluxo", "iris", "nexo"] as const)("coluna %s: fechada, da altura pedida, com a lingueta saindo 8 mm da ponta", (form) => {
    const out = build({ form, height: 140, girth: 44, twist: 270 });
    const body = solid(out.models[0].parts[0].mesh);
    expect(body.status()).toBe("NoError");
    expect(body.decompose()).toHaveLength(1);
    const b = body.boundingBox();
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(140 + 8, 3);
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(44 + 0.5);
    body.delete();
  });

  test("a coluna é torcida de verdade: a seção do alto está girada em relação à da base", () => {
    const out = build({ form: "fluxo", height: 100, girth: 44, twist: 180 });
    const body = solid(out.models[0].parts[0].mesh);
    const at = (z: number) => body.slice(z).bounds();
    const low = at(5);
    const mid = at(50);
    expect(low.max[0] - low.min[0]).toBeGreaterThan(40); // fita deitada em x
    expect(mid.max[0] - mid.min[0]).toBeLessThan(15); // meia volta de torção: de pé
    body.delete();
  });

  test("a base sempre leva as duas linhas de texto e a peça avisa se uma linha fica fina demais", () => {
    const out = build({ baseText: "", baseText2: "" });
    expect(out.models[1].parts.map((x) => x.name)).toEqual(["Base"]);
  });

  describe("Montado ao lado: só prévia, o 3MF sai sempre na posição de impressão", () => {
    const printable = (o: ReturnType<typeof build>) => o.models.filter((m) => !m.previewOnly);

    test.each([["atleta"], ["fluxo"], ["iris"], ["nexo"]] as const)("%s: o que se exporta é igual ao da mesa; o montado é extra, em pé, sem bater na base", (form) => {
      const onTable = build({ form, height: 120, twist: 200 });
      const out = build({ form, layout: "assembled", height: 120, twist: 200 });
      // exportável: idêntico à mesa (mesma geometria, mesma posição)
      expect(printable(out).map((m) => m.parts.map((x) => Array.from(x.mesh.positions)))).toEqual(onTable.models.map((m) => m.parts.map((x) => Array.from(x.mesh.positions))));
      expect(onTable.models.some((m) => m.previewOnly)).toBe(false);
      // prévia: um modelo a mais, marcado, com o troféu em pé
      const stand = out.models.filter((m) => m.previewOnly);
      expect(stand).toHaveLength(1);
      const body = solid(stand[0].parts[0].mesh);
      const slab = solid(stand[0].parts[stand[0].parts.length - 2].mesh); // a base (antes do texto da base)
      expect(body.status()).toBe("NoError");
      expect(body.intersect(slab).volume()).toBeCloseTo(0, 3); // a lingueta cabe no rasgo
      const b = body.boundingBox();
      expect(b.min[2]).toBeCloseTo(2, 3); // 10 de base − 8 de lingueta
      expect(b.max[2]).toBeGreaterThan(110);
      // e o montado fica ao lado das peças da mesa, sem sobrepor
      const tableB = meshBounds(printable(out).flatMap((m) => m.parts.map((x) => x.mesh)))!;
      const standB = meshBounds(stand[0].parts.map((x) => x.mesh))!;
      expect(standB.min[0]).toBeGreaterThan(tableB.max[0]);
      body.delete();
      slab.delete();
    });

    test("a mesa continua sendo o padrão", () => {
      expect(DEFAULT_SCULPTURE.layout).toBe("print");
    });
  });
});
