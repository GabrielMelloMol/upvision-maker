import { beforeAll, describe, expect, test } from "vitest";
import { buildKeychain, DEFAULT_KEYCHAIN, layoutOnPlate, parseNames } from "./keychain";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { csFromContours, scoped } from "./shape2d";
import { modelSize, modelVolume, sq } from "./testUtil";
import { modelsBounds } from "./bounds";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// "texto" de teste: dois quadrados de 10 mm separados por 8 mm (como duas letras afastadas)
const letters = () => csFromContours(M, [sq(5, -9, 0), sq(5, 9, 0)], "NonZero");

describe("chaveiro", () => {
  test("2 partes (base e texto) em cores diferentes; texto em relevo sobre a base", () => {
    const m = scoped((k) => buildKeychain(M, k(letters()), { ...DEFAULT_KEYCHAIN, ring: false }, "Teste"));
    expect(m.parts.map((p) => p.name)).toEqual(["Base", "Texto"]);
    expect(m.parts[0].color).not.toBe(m.parts[1].color);
    expect(modelSize(m)[2]).toBeCloseTo(DEFAULT_KEYCHAIN.base + DEFAULT_KEYCHAIN.relief);
    // relevo = área das letras × altura do relevo
    const textVol = modelVolume({ ...m, parts: [m.parts[1]] });
    expect(textVol).toBeCloseTo(200 * DEFAULT_KEYCHAIN.relief, 0);
  });

  test("base une letras afastadas numa peça só", () => {
    const m = scoped((k) => buildKeychain(M, k(letters()), { ...DEFAULT_KEYCHAIN, ring: false }, "Teste"));
    const [w, h] = modelSize(m);
    expect(w).toBeCloseTo(28 + 2 * DEFAULT_KEYCHAIN.border, 0);
    expect(h).toBeCloseTo(10 + 2 * DEFAULT_KEYCHAIN.border, 0);
    const baseVol = modelVolume({ ...m, parts: [m.parts[0]] });
    // o vão de 8 mm entre as letras também é base (senão sairiam 2 pedaços)
    expect(baseVol / DEFAULT_KEYCHAIN.base).toBeGreaterThan(28 * 10 + 2 * DEFAULT_KEYCHAIN.border * 38);
  });

  test("argola à esquerda aumenta a largura e tem furo", () => {
    const [noRing, ring] = scoped((k) => [
      buildKeychain(M, k(letters()), { ...DEFAULT_KEYCHAIN, ring: false }, "a"),
      buildKeychain(M, k(letters()), { ...DEFAULT_KEYCHAIN, ring: true }, "b"),
    ]);
    const extra = modelSize(ring)[0] - modelSize(noRing)[0];
    expect(extra).toBeGreaterThan(4);
    const disc = Math.PI * DEFAULT_KEYCHAIN.ringOuter ** 2;
    expect(modelVolume(ring) - modelVolume(noRing)).toBeLessThan(disc * DEFAULT_KEYCHAIN.base); // o furo tira material
  });
});

test("parseNames aceita linhas ou vírgulas, ignora vazios e repetidos", () => {
  expect(parseNames("Ana, Bia\n\n Caio \nAna")).toEqual(["Ana", "Bia", "Caio"]);
});

test("layoutOnPlate distribui sem sobrepor e dentro da mesa", () => {
  const models = scoped((k) => Array.from({ length: 12 }, (_, i) => buildKeychain(M, k(letters()), DEFAULT_KEYCHAIN, `n${i}`)));
  const placed = layoutOnPlate(models, 256, 5);
  const boxes = placed.map((m) => modelsBounds([m])!);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1];
      expect(overlap).toBe(false);
    }
  }
  const all = modelsBounds(placed)!;
  expect(all.max[0] - all.min[0]).toBeLessThanOrEqual(256);
});
