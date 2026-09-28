import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";
import { extrudeDesign } from "./extrude";
import { buildKeychain, DEFAULT_KEYCHAIN } from "./keychain";
import { getManifold, type CS, type ManifoldToplevel } from "./manifold";
import { buildMedal, DEFAULT_MEDAL } from "./medal";
import { scoped } from "./shape2d";
import { sq, volume } from "./testUtil";
import { write3mf } from "./threemf";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** Quadrado 20×20 azul com miolo 10×10 vermelho (regiões encaixadas, como sai do svgToColorRegions). */
function layers(k: <D extends { delete(): void }>(o: D) => D) {
  const outer = k(new M.CrossSection([sq(10)], "NonZero"));
  const inner = k(new M.CrossSection([sq(5)], "NonZero"));
  return { all: outer, layers: [{ color: "#2563eb", cs: k(outer.subtract(inner)) as CS }, { color: "#d6262e", cs: inner }] };
}

describe("desenho colorido vira uma parte por cor", () => {
  test("extrusão sem base: 2 partes com as cores do desenho e volumes certos", () =>
    scoped((k) => {
      const { all, layers: l } = layers(k);
      const m = extrudeDesign(M, all, { height: 2, base: null }, "x", l);
      expect(m.parts.map((p) => p.color)).toEqual(["#2563eb", "#d6262e"]);
      expect(volume(m.parts[0].mesh)).toBeCloseTo((400 - 100) * 2, 0);
      expect(volume(m.parts[1].mesh)).toBeCloseTo(100 * 2, 0);
    }));

  test("extrusão com base: base + cores em cima da base", () =>
    scoped((k) => {
      const { all, layers: l } = layers(k);
      const m = extrudeDesign(M, all, { height: 1, base: { margin: 0, thickness: 1.5 } }, "x", l);
      expect(m.parts.map((p) => p.name)).toEqual(["Base", "Cor 1", "Cor 2"]);
      const zMin = Math.min(...Array.from(m.parts[2].mesh.positions).filter((_, i) => i % 3 === 2));
      expect(zMin).toBeCloseTo(1.5);
    }));

  test("chaveiro com logo colorido: base + texto + uma parte por cor do logo", () =>
    scoped((k) => {
      const { all, layers: l } = layers(k);
      const txt = k(new M.CrossSection([sq(4, 30, 0)], "NonZero"));
      const art = k(all.add(txt));
      const m = buildKeychain(M, art, DEFAULT_KEYCHAIN, "Ana", l);
      expect(m.parts.map((p) => p.name)).toEqual(["Base", "Texto", "Logo 1", "Logo 2"]);
      expect(volume(m.parts[1].mesh)).toBeCloseTo(64 * DEFAULT_KEYCHAIN.relief, 0); // o texto não inclui o logo
    }));

  test("medalha com imagem colorida: a imagem sai em 2 partes, dentro da medalha", () =>
    scoped((k) => {
      const { all, layers: l } = layers(k);
      const m = buildMedal(M, { ...DEFAULT_MEDAL, ribbon: 0 }, all, null, l);
      expect(m.parts.map((p) => p.name)).toEqual(["Base", "Destaque", "Imagem 1", "Imagem 2"]);
      expect(m.parts.slice(2).map((p) => p.color)).toEqual(["#2563eb", "#d6262e"]);
      const [a, b] = [volume(m.parts[2].mesh), volume(m.parts[3].mesh)];
      expect(a / b).toBeCloseTo(3, 1); // mesma proporção do desenho (300:100)
    }));

  test("3MF: cada cor vira um filamento (extrusora); cor repetida usa o mesmo", () =>
    scoped((k) => {
      const { all, layers: l } = layers(k);
      const m = extrudeDesign(M, all, { height: 2, base: { margin: 1, thickness: 1 } }, "x", [{ ...l[0], color: "#ffffff" }, l[1]]);
      const cfg = strFromU8(unzipSync(write3mf([m]))["Metadata/model_settings.config"]);
      expect([...cfg.matchAll(/<part[^>]*>.*?key="extruder" value="(\d)"/g)].map((x) => x[1])).toEqual(["1", "2", "3"]);
      const same = extrudeDesign(M, all, { height: 2, base: { margin: 1, thickness: 1 } }, "x", l); // base azul = cor 1 azul
      const cfg2 = strFromU8(unzipSync(write3mf([same]))["Metadata/model_settings.config"]);
      expect([...cfg2.matchAll(/<part[^>]*>.*?key="extruder" value="(\d)"/g)].map((x) => x[1])).toEqual(["1", "1", "2"]);
    }));
});
