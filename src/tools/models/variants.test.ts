import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { arcTextToCrossSection, textToCrossSection } from "../../geometry/text";
import { MODELS } from "./defs";
import { COLLECTIONS, inCollection, MODEL_COLLECTIONS, VARIANTS } from "./variants";

let M: ManifoldToplevel;
const b = readFileSync(resolve(__dirname, "../../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
beforeAll(async () => {
  M = await getManifold();
});

const LICENSED = /disney|mickey|minnie|frozen|harry|potter|marvel|barbie|pok[eé]mon|copa|fifa|flamengo|corinthians|palmeiras|messi|neymar/i;

describe("variações e coleções", () => {
  test("toda variação e coleção aponta para um modelo que existe", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    for (const id of [...Object.keys(VARIANTS), ...Object.keys(MODEL_COLLECTIONS)]) expect(ids, id).toContain(id);
  });

  test("variação só usa campos do modelo e nada licenciado", () => {
    for (const [id, vs] of Object.entries(VARIANTS)) {
      const keys = Object.keys(MODELS.find((m) => m.id === id)!.defaults);
      for (const v of vs) {
        for (const k of Object.keys(v.patch)) expect(keys, `${id}/${v.label}: ${k}`).toContain(k);
        expect(JSON.stringify(v)).not.toMatch(LICENSED);
      }
    }
  });

  test("toda coleção tem pelo menos 2 modelos", () => {
    for (const [c] of COLLECTIONS) expect(MODELS.filter((m) => inCollection(m.id, c)).length, c).toBeGreaterThanOrEqual(2);
  });

  test("toda variação gera o modelo sem erro", () => {
    const ctx = { M, art: null, artLayers: null, text: (s: string, h: number) => (s.trim() ? textToCrossSection(M, font, s, h) : null), arc: (s: string, h: number, r: number, side: "top" | "bottom") => arcTextToCrossSection(M, font, s, h, r, side) };
    for (const [id, vs] of Object.entries(VARIANTS)) {
      const def = MODELS.find((m) => m.id === id)!;
      for (const v of vs) expect(() => def.build(ctx, { ...def.defaults, ...v.patch }), `${id}/${v.label}`).not.toThrow();
    }
  }, 120_000);
});
