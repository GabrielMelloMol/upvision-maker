import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildNfcKeychain, DEFAULT_NFC, type NfcKeychainParams } from "./nfcKeychain";
import { buildOpener, DEFAULT_OPENER, type OpenerParams } from "./opener";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const opener = (p: Partial<OpenerParams> = {}) => buildOpener(ctx(), { ...DEFAULT_OPENER, ...p });
const nfc = (p: Partial<NfcKeychainParams> = {}) => buildNfcKeychain(ctx(), { ...DEFAULT_NFC, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("abridor: fenda posicionável e bolso NFC (#69)", { timeout: 30_000 }, () => {
  test("mover a fenda muda onde falta material; perto da borda avisa", () => {
    const at = (p: Partial<OpenerParams>) => {
      const s = solid(opener({ kind: "can", ...p }).models[0].parts[0].mesh);
      // sonda pequena no lugar padrão da fenda
      const probe = M.Manifold.cube([2, 2, 2], true).translate([78 / 2 - 9, 0, 1]);
      const v = s.intersect(probe).volume();
      [s, probe].forEach((o) => o.delete());
      return v;
    };
    expect(at({})).toBeCloseTo(0, 3); // fenda no lugar padrão: vazio
    expect(at({ slotX: -12 })).toBeGreaterThan(7); // fenda mudou: ali voltou a ter material
    expect(opener({ kind: "can", slotY: 12 }).warnings!.join(" ")).toMatch(/encosta na borda/);
    expect(opener({ kind: "can", slotAngle: 90 }).models[0].parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  test("bolso NFC: tira o volume da tag e pausa depois do bolso; tag grande demais dá erro", () => {
    const plain = solid(opener().models[0].parts[0].mesh), withTag = solid(opener({ nfc: true }).models[0].parts[0].mesh);
    expect(plain.volume() - withTag.volume()).toBeGreaterThan(Math.PI * 13 ** 2 * 0.8);
    expect(opener({ nfc: true }).pauses).toHaveLength(1);
    expect(opener({ nfc: true }).warnings!.join(" ")).toMatch(/coloque a tag NFC/);
    expect(opener().pauses).toEqual([]);
    expect(() => opener({ nfc: true, tagDiameter: 35 })).toThrow(/não cabe no abridor/);
  });
});

describe("chaveiro NFC: formatos novos (#69)", { timeout: 30_000 }, () => {
  test.each(["heart", "hexagon", "star", "dodecagon"] as NfcKeychainParams["shape"][])("%s: uma peça, argola encostada, bolso e pausa", (shape) => {
    const out = nfc({ shape, size: shape === "heart" ? 60 : shape === "star" ? 50 : 38 });
    const s = solid(out.models[0].parts[0].mesh);
    // 1 peça por fora + 1 casca do bolso fechado por dentro
    expect(s.decompose().length).toBe(2);
    expect(out.pauses).toHaveLength(1);
    const b = meshBounds([out.models[0].parts[0].mesh])!;
    expect(b.max[1] - b.min[1]).toBeGreaterThan(38 + 5); // a argola ficou presa em cima
  });

  test("tag que não cabe no formato avisa para aumentar", () => {
    expect(() => nfc({ shape: "star", size: 32 })).toThrow(/aumente o tamanho/);
  });
});
