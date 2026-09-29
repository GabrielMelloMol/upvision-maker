import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { arcTextToCrossSection } from "./text";

let M: ManifoldToplevel;
const b = readFileSync(resolve(__dirname, "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
beforeAll(async () => {
  M = await getManifold();
});

describe("texto em arco", () => {
  test("em cima: letras entre o raio da base e raio + altura, acima do centro, simétrico", () =>
    scoped((k) => {
      const cs = k(arcTextToCrossSection(M, font, "CORRIDA 10K", 5, 20, "top"));
      const bb = cs.bounds();
      expect(bb.min[1]).toBeGreaterThan(0);
      expect(bb.max[1]).toBeLessThanOrEqual(20 + 5 + 0.5);
      expect(Math.abs(bb.min[0] + bb.max[0])).toBeLessThan(2); // centrado
      // nenhum ponto dentro do raio da base (menos a sobra de ascendente/descendente)
      const inner = k(M.CrossSection.circle(19, 96));
      expect(k(cs.intersect(inner)).area()).toBeLessThan(cs.area() * 0.05);
    }));

  test("embaixo: abaixo do centro, dentro do raio da base (letras apontando para o centro)", () =>
    scoped((k) => {
      const cs = k(arcTextToCrossSection(M, font, "2026", 5, 20, "bottom"));
      const bb = cs.bounds();
      expect(bb.max[1]).toBeLessThan(0);
      expect(bb.min[1]).toBeGreaterThanOrEqual(-20.5);
      expect(bb.max[1]).toBeLessThan(-14); // a altura cresce para dentro
    }));

  test("raio maior = arco mais aberto (mais largo e mais achatado)", () =>
    scoped((k) => {
      const small = k(arcTextToCrossSection(M, font, "CAMPEONATO", 4, 15, "top")).bounds();
      const big = k(arcTextToCrossSection(M, font, "CAMPEONATO", 4, 40, "top")).bounds();
      expect(big.max[1] - big.min[1]).toBeLessThan(small.max[1] - small.min[1]);
    }));

  test("texto longo demais para o arco: erro claro; vazio: erro", () => {
    expect(() => arcTextToCrossSection(M, font, "UM TEXTO MUITO MUITO LONGO PARA UM ARCO PEQUENO", 6, 5, "top")).toThrow(/longo demais/);
    expect(() => arcTextToCrossSection(M, font, "  ", 6, 5, "top")).toThrow(/Digite/);
  });
});
