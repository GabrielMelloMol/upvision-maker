import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { medalOutline, type MedalShape } from "./medal";
import { medalRim, medalTexture, type RimStyle, type Texture } from "./medalDecor";
import { buildMedalDesign, DEFAULT_MEDAL_DESIGN, type MedalCtx, type MedalDesign } from "./medalDesign";
import { scoped } from "./shape2d";
import { arcTextToCrossSection, textToCrossSection } from "./text";
import { sq, volume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
const b = readFileSync(resolve(__dirname, "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: MedalCtx["art"] = null, artLayers: MedalCtx["artLayers"] = null): MedalCtx => ({
  M,
  art,
  artLayers,
  text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null),
  arc: (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, font, s, h, r, side) : null),
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const bb = (m: Mesh) => meshBounds([m])!;
const part = (m: Model, name: string) => m.parts.find((p) => p.name === name)!;
function printable(models: Model[]) {
  for (const m of models)
    for (const p of m.parts) {
      expect(solid(p.mesh).status()).toBe("NoError");
      expect(volume(p.mesh)).toBeGreaterThan(0);
      expect(bb(p.mesh).min[2]).toBeGreaterThanOrEqual(-1e-4);
    }
}

/** Critério de aceite da #19. */
const RACE: MedalDesign = {
  ...DEFAULT_MEDAL_DESIGN,
  diameter: 70,
  rimStyle: "laurel",
  rim: 5,
  top: "CORRIDA DE RUA",
  center: "10K",
  centerSize: 12,
  rank: "1º LUGAR",
  bottom: "NITERÓI",
  back: true,
  backText: "28/09/2026\nPARABÉNS!",
};

describe("formatos, bordas e fundos", () => {
  test.each(["circle", "oval", "hexagon", "octagon", "star", "star6", "star8", "shield", "shieldPoints", "heart", "gear"] as MedalShape[])("formato %s: maior lado = diâmetro, centrado", (shape) =>
    scoped((k) => {
      const o = k(medalOutline(M, shape, 50));
      const r = o.bounds();
      expect(Math.max(r.max[0] - r.min[0], r.max[1] - r.min[1])).toBeCloseTo(50, 1);
      expect(Math.abs(r.min[0] + r.max[0])).toBeLessThan(0.01);
      expect(o.area()).toBeGreaterThan(300);
    }),
  );

  test.each(["simple", "double", "serrated", "dotted", "laurel"] as RimStyle[])("borda %s fica dentro do contorno e ocupa parte da faixa", (style) =>
    scoped((k) => {
      const o = k(medalOutline(M, "circle", 60));
      const rim = k(medalRim(M, o, 4, style)!);
      expect(k(rim.subtract(o)).area()).toBeLessThan(0.01);
      const band = k(o.subtract(k(o.offset(-4 * 2.2, "Round"))));
      expect(rim.area()).toBeGreaterThan(band.area() * 0.1);
    }),
  );

  test.each(["sunburst", "dots", "stripes"] as Texture[])("fundo %s fica dentro da área e não cobre tudo", (t) =>
    scoped((k) => {
      const inner = k(M.CrossSection.circle(20, 64));
      const tex = k(medalTexture(M, inner, t)!);
      expect(tex.area()).toBeGreaterThan(inner.area() * 0.1);
      expect(tex.area()).toBeLessThan(inner.area() * 0.8);
      expect(k(tex.subtract(inner)).area()).toBeLessThan(0.01);
    }),
  );
});

describe("medalha de corrida (aceite da #19)", () => {
  test("texto em arco, número, colocação, louros e verso com data: tudo imprimível", () => {
    const models = buildMedalDesign(ctx(), RACE);
    printable(models);
    expect(models.map((m) => m.name)).toEqual(["10K", "Verso", "Pinos"]);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Base", "Borda", "Textos"]);
    expect(models[1].parts.map((p) => p.name)).toEqual(["Verso", "Textos do verso"]);
    const txt = bb(part(models[0], "Textos").mesh);
    expect(txt.min[2]).toBeCloseTo(RACE.thickness);
    expect(txt.max[1]).toBeGreaterThan(20); // o arco de cima chega perto da borda
  });

  test("pinos entram nos furos da frente e do verso (com folga)", () => {
    const [front, back, pins] = buildMedalDesign(ctx(), RACE);
    const pinParts = solid(pins.parts[0].mesh).decompose();
    expect(pinParts).toHaveLength(2);
    const pinLen = pinParts[0].boundingBox().max[2] - pinParts[0].boundingBox().min[2];
    expect(pinLen).toBeLessThan(2.5 + 1.4); // cabe na soma das profundidades
    const f = solid(part(front, "Base").mesh);
    const hole = M.Manifold.cylinder(2.4, 1.45, 1.45, 24).translate([RACE.diameter * 0.22, 0, 0]);
    expect(f.intersect(hole).volume()).toBeCloseTo(0, 2);
    expect(volume(back.parts[0].mesh)).toBeGreaterThan(0);
  });
});

describe("opções", () => {
  test("baixo relevo: detalhes rentes à face (topo = espessura) e a base perde o material deles", () => {
    const up = buildMedalDesign(ctx(), { ...RACE, back: false })[0];
    const flat = buildMedalDesign(ctx(), { ...RACE, back: false, engraved: true })[0];
    expect(bb(part(flat, "Textos").mesh).max[2]).toBeCloseTo(RACE.thickness);
    expect(bb(part(up, "Textos").mesh).max[2]).toBeCloseTo(RACE.thickness + RACE.relief);
    expect(volume(part(flat, "Base").mesh)).toBeLessThan(volume(part(up, "Base").mesh));
    printable([flat]);
  });

  test.each([20, 25, 38])("fita de %i mm passa pelo rasgo da alça", (w) => {
    const [m] = buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, ribbonWidth: w });
    const base = solid(part(m, "Base").mesh);
    const top = base.boundingBox().max[1];
    const ribbon = M.Manifold.cube([w - 0.5, 2.5, 20], true).translate([0, top - 6.5, 0]);
    expect(base.intersect(ribbon).volume()).toBeCloseTo(0, 2);
  });

  test("argola e furo simples furam a peça; sem alça, nada acima do contorno", () => {
    for (const hanger of ["ring", "hole"] as const) expect(solid(part(buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, hanger })[0], "Base").mesh).genus()).toBe(1);
    const none = bb(part(buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, hanger: "none" })[0], "Base").mesh);
    expect(none.max[1]).toBeCloseTo(DEFAULT_MEDAL_DESIGN.diameter / 2, 1);
  });

  test("ímã: rebaixo de 10 × 3 no verso; medalha fina demais dá erro claro", () => {
    const [m] = buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, backMount: "magnet", thickness: 4.5 });
    const magnet = M.Manifold.cylinder(3, 5, 5, 32);
    expect(solid(part(m, "Base").mesh).intersect(magnet).volume()).toBeCloseTo(0, 2);
    expect(() => buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, backMount: "magnet", thickness: 3 })).toThrow(/pelo menos 3,9 mm/);
  });

  test("fundo com textura: parte própria, afastada dos textos", () => {
    const [m] = buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, texture: "sunburst" });
    printable([m]);
    const fundo = solid(part(m, "Fundo").mesh);
    const textos = solid(part(m, "Textos").mesh);
    expect(fundo.intersect(textos).volume()).toBeCloseTo(0, 3);
  });

  test("imagem: escala, deslocamento e rotação; colorida sai uma parte por cor", () => {
    const art = new M.CrossSection([sq(10)], "NonZero");
    const a = bb(part(buildMedalDesign(ctx(art), { ...DEFAULT_MEDAL_DESIGN, center: "", artScale: 0.3 })[0], "Imagem").mesh);
    const moved = bb(part(buildMedalDesign(ctx(art), { ...DEFAULT_MEDAL_DESIGN, center: "", artScale: 0.3, artX: 5 })[0], "Imagem").mesh);
    expect(moved.min[0] - a.min[0]).toBeCloseTo(5, 1);
    const turned = bb(part(buildMedalDesign(ctx(art), { ...DEFAULT_MEDAL_DESIGN, center: "", artScale: 0.3, artRotation: 45 })[0], "Imagem").mesh);
    expect(turned.max[0] - turned.min[0]).toBeGreaterThan((a.max[0] - a.min[0]) * 1.3);
    const inner = new M.CrossSection([sq(5)], "NonZero");
    const layers = [
      { color: "#2563eb", cs: art.subtract(inner) },
      { color: "#d6262e", cs: inner },
    ];
    const multi = buildMedalDesign(ctx(art, layers), { ...DEFAULT_MEDAL_DESIGN, center: "" })[0];
    expect(multi.parts.filter((p) => p.name.startsWith("Imagem")).map((p) => p.color)).toEqual(["#2563eb", "#d6262e"]);
  });

  test("formato livre segue o contorno do desenho; sem desenho, erro claro", () => {
    const art = new M.CrossSection([[[-10, -10], [10, -10], [0, 12]]], "NonZero");
    const [m] = buildMedalDesign(ctx(art), { ...DEFAULT_MEDAL_DESIGN, shape: "free", hanger: "none", center: "" });
    printable([m]);
    const r = bb(part(m, "Base").mesh);
    expect(Math.max(r.max[0] - r.min[0], r.max[1] - r.min[1])).toBeCloseTo(DEFAULT_MEDAL_DESIGN.diameter, 0);
    expect(() => buildMedalDesign(ctx(), { ...DEFAULT_MEDAL_DESIGN, shape: "free" })).toThrow(/envie um desenho/);
  });
});
