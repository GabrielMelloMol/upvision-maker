import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";
import { textToCrossSection } from "./text";
import { checkText, textWarnings, thinLineWarning } from "./textCheck";

let M: ManifoldToplevel;
const font = (file: string) => {
  const b = readFileSync(resolve(__dirname, "../assets/fonts", file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
beforeAll(async () => {
  M = await getManifold();
});

test("fonte grossa em tamanho normal: sem traço fino", () =>
  scoped((k) => {
    const c = checkText(k(textToCrossSection(M, font("archivo-black-400.ttf"), "Ana", 14)));
    expect(c.thin).toBe(false);
    expect(c.pieces).toBe(3);
  }));

test("cursiva fina pequena acusa traço < 0,4 mm", () =>
  scoped((k) => {
    const c = checkText(k(textToCrossSection(M, font("great-vibes-400.ttf"), "Ana", 8)));
    expect(c.thin).toBe(true);
  }));

test("cursiva que une as letras: uma peça, pingo do i não conta", () =>
  scoped((k) => {
    const c = checkText(k(textToCrossSection(M, font("pacifico-400.ttf"), "lili", 15)));
    expect(c.pieces).toBe(1);
  }));

test("avisos: letras soltas só em cursiva e com mais de 2 partes por palavra", () => {
  expect(textWarnings({ thin: false, pieces: 7 }, "Ana Júlia", false)).toEqual([]);
  expect(textWarnings({ thin: false, pieces: 3 }, "Ana Júlia", true)).toEqual([]);
  expect(textWarnings({ thin: false, pieces: 7 }, "Ana Júlia", true)[0]).toMatch(/7 partes/);
  expect(textWarnings({ thin: true, pieces: 1 }, "Ana", false)[0]).toMatch(/0,4 mm/);
});

test("cursiva de letras separadas (Courgette) é pega; Pacifico não", () =>
  scoped((k) => {
    const warn = (file: string) => textWarnings(checkText(k(textToCrossSection(M, font(file), "Ana Júlia", 14))), "Ana Júlia", true);
    expect(warn("courgette-400.ttf").join()).toMatch(/não se unem/);
    expect(warn("pacifico-400.ttf")).toEqual([]);
  }));

test("linha no tamanho final (#146): 2 mm na Hanken avisa com o texto e a altura; 8 mm não avisa", () =>
  scoped((k) => {
    const f = font("hanken-grotesk-800.ttf");
    const small = k(textToCrossSection(M, f, "CAMPEÃ", 2));
    expect(thinLineWarning(small, "CAMPEÃ")).toMatch(/^"CAMPEÃ" ficou com 2,0 mm de altura: os traços ficam com menos de 0,4 mm/);
    expect(thinLineWarning(k(textToCrossSection(M, f, "CAMPEÃ", 8)), "CAMPEÃ")).toBeNull();
    // texto longo aparece cortado no aviso
    expect(thinLineWarning(small, "Uma frase bem comprida para o aviso")).toMatch(/^"Uma frase bem compri…"/);
  }));
