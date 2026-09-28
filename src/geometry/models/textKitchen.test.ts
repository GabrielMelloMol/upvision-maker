import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type CS, type ManifoldToplevel } from "../manifold";
import { sq, volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import { buildBagClip, DEFAULT_BAG_CLIP } from "./bagClip";
import { buildEjector, DEFAULT_EJECTOR } from "./brigadeiroEjector";
import type { ModelCtx } from "./common";
import { buildCutterStamp, DEFAULT_CUTTER_STAMP } from "./cutterStamp";
import { buildLogoPlate, DEFAULT_ADAPTIVE_PLATE, DEFAULT_LOGO_KEYCHAIN } from "./logoPlate";
import { buildPencilTopper, DEFAULT_PENCIL_TOPPER } from "./pencilTopper";
import { buildSignPlate, DEFAULT_SIGN_PLATE } from "./signPlate";
import { buildWordDecor, DEFAULT_WORD_DECOR } from "./wordDecor";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: CS | null = null, artLayers: ModelCtx["artLayers"] = null): ModelCtx => ({
  M,
  art,
  artLayers,
  text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null),
});
/** Quadrado 20×20 com miolo 10×10 (dois componentes: contorno e detalhe interno). */
const ringArt = () => new M.CrossSection([sq(10), sq(7), sq(3)], "EvenOdd");
const b = (m: Mesh) => meshBounds([m])!;

/** Toda parte precisa ser um sólido fechado (manifold) com volume. */
function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const p of m.parts) {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }));
      expect(s.status()).toBe("NoError");
      expect(volume(p.mesh)).toBeGreaterThan(0);
      expect(b(p.mesh).min[2]).toBeGreaterThanOrEqual(-1e-4); // nada abaixo da mesa
      s.delete();
    }
}

describe("chaveiro de logo e placa adaptável", () => {
  test("arte de 1 cor: base + arte em cima, largura da arte respeitada, argola só no chaveiro", () => {
    const k = buildLogoPlate(ctx(ringArt()), DEFAULT_LOGO_KEYCHAIN).models;
    expectPrintable(k);
    expect(k[0].parts.map((p) => p.name)).toEqual(["Base", "Arte"]);
    const art = b(k[0].parts[1].mesh);
    expect(art.max[0] - art.min[0]).toBeCloseTo(DEFAULT_LOGO_KEYCHAIN.width, 0);
    expect(art.min[2]).toBeCloseTo(DEFAULT_LOGO_KEYCHAIN.base);
    const plate = buildLogoPlate(ctx(ringArt()), DEFAULT_ADAPTIVE_PLATE).models;
    const kw = b(k[0].parts[0].mesh), pw = b(plate[0].parts[0].mesh);
    // o chaveiro tem argola saindo à esquerda; a placa é só o contorno + borda
    expect(kw.max[0] - kw.min[0]).toBeGreaterThan(DEFAULT_LOGO_KEYCHAIN.width + 2 * DEFAULT_LOGO_KEYCHAIN.border + 2);
    expect(pw.max[0] - pw.min[0]).toBeCloseTo(DEFAULT_ADAPTIVE_PLATE.width + 2 * DEFAULT_ADAPTIVE_PLATE.border, 0);
  });

  test("arte colorida: uma parte por cor, sem sobra de 'Arte' de 1 cor", () => {
    const art = new M.CrossSection([sq(10)], "NonZero");
    const inner = new M.CrossSection([sq(5)], "NonZero");
    const layers = [
      { color: "#2563eb", cs: art.subtract(inner) },
      { color: "#d6262e", cs: inner },
    ];
    const m = buildLogoPlate(ctx(art, layers), DEFAULT_LOGO_KEYCHAIN).models;
    expectPrintable(m);
    expect(m[0].parts.map((p) => p.color)).toEqual([DEFAULT_LOGO_KEYCHAIN.baseColor, "#2563eb", "#d6262e"]);
  });

  test("sem desenho: pede para enviar", () => {
    expect(() => buildLogoPlate(ctx(), DEFAULT_LOGO_KEYCHAIN)).toThrow(/Envie um desenho/);
  });
});

describe("topo de lápis", () => {
  test("corpo com furo horizontal do diâmetro pedido entrando por baixo", () => {
    const { models } = buildPencilTopper(ctx(), DEFAULT_PENCIL_TOPPER);
    expectPrintable(models);
    const body = models[0].parts[0].mesh;
    const bb = b(body);
    expect(bb.max[2]).toBeCloseTo(DEFAULT_PENCIL_TOPPER.body);
    // um lápis (cilindro um pouco mais fino que o furo) entra pelo pescoço sem bater no corpo
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: body.positions, triVerts: body.indices }));
    const pencil = M.Manifold.cylinder(15, DEFAULT_PENCIL_TOPPER.holeD / 2 - 0.2, DEFAULT_PENCIL_TOPPER.holeD / 2 - 0.2, 32).rotate([-90, 0, 0]).translate([0, bb.min[1] - 1, DEFAULT_PENCIL_TOPPER.body / 2]);
    expect(s.intersect(pencil).volume()).toBeCloseTo(0, 1);
  });

  test("corpo fino demais para o furo: erro claro", () => {
    expect(() => buildPencilTopper(ctx(), { ...DEFAULT_PENCIL_TOPPER, body: 8 })).toThrow(/pelo menos 10,2 mm/);
  });
});

describe("placa de sinalização", () => {
  test("com ícone: painel elevado com o ícone vazado + texto à direita, tudo dentro da placa", () => {
    const { models } = buildSignPlate(ctx(new M.CrossSection([sq(5)], "NonZero")), DEFAULT_SIGN_PLATE);
    expectPrintable(models);
    const [plate, panel, txt] = models[0].parts;
    expect(models[0].parts.map((p) => p.name)).toEqual(["Placa", "Painel", "Texto"]);
    const side = DEFAULT_SIGN_PLATE.height * 0.8;
    expect(volume(panel.mesh)).toBeLessThan(side * side * DEFAULT_SIGN_PLATE.panel * 0.8); // tem o recorte
    expect(b(txt.mesh).min[0]).toBeGreaterThan(b(panel.mesh).max[0]);
    expect(b(txt.mesh).max[0]).toBeLessThanOrEqual(b(plate.mesh).max[0]);
  });

  test("sem ícone: só placa e texto; sem nada: erro", () => {
    expect(buildSignPlate(ctx(), DEFAULT_SIGN_PLATE).models[0].parts.map((p) => p.name)).toEqual(["Placa", "Texto"]);
    expect(() => buildSignPlate(ctx(), { ...DEFAULT_SIGN_PLATE, text: " " })).toThrow(/Digite o texto/);
  });
});

describe("decoração de palavras", () => {
  test("base com rebaixo no formato da palavra de encaixe; palavra separada e mais fina", () => {
    const { models } = buildWordDecor(ctx(), DEFAULT_WORD_DECOR);
    expectPrintable(models);
    const [base, word] = models;
    const bb = b(base.parts[0].mesh), wb = b(word.parts[0].mesh);
    expect(bb.max[2]).toBeCloseTo(DEFAULT_WORD_DECOR.baseThickness);
    expect(wb.max[2]).toBeCloseTo(DEFAULT_WORD_DECOR.wordThickness);
    expect(wb.max[1]).toBeLessThan(bb.min[1]); // não se sobrepõem na mesa
    const w = bb.max[0] - bb.min[0], h = bb.max[1] - bb.min[1];
    expect(volume(base.parts[0].mesh)).toBeLessThan(w * h * DEFAULT_WORD_DECOR.baseThickness); // rebaixo tirou material
  });
});

describe("culinária", () => {
  test("ejetor: êmbolo cabe na forma com a folga", () => {
    const { models } = buildEjector(ctx(new M.CrossSection([sq(10)], "NonZero")), DEFAULT_EJECTOR);
    expectPrintable(models);
    const frame = b(models[0].parts[0].mesh);
    const plate = b(models[1].parts[0].mesh);
    expect(frame.max[2]).toBeCloseTo(DEFAULT_EJECTOR.height);
    // placa do êmbolo = desenho − folga; forma = desenho + parede + aba
    expect(frame.max[1] - frame.min[1]).toBeCloseTo(DEFAULT_EJECTOR.size + 2 * (DEFAULT_EJECTOR.wall + 3), 0);
    expect(plate.max[2]).toBeGreaterThan(DEFAULT_EJECTOR.height); // cabo passa da forma
  });

  test("clipe de saco: fenda com a folga pedida atravessando a forquilha", () => {
    const { models } = buildBagClip(ctx(new M.CrossSection([sq(10)], "NonZero")), DEFAULT_BAG_CLIP);
    expectPrintable(models);
    const clip = models[0].parts[0].mesh;
    const cb = b(clip);
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: clip.positions, triVerts: clip.indices }));
    const cy = (cb.min[1] + cb.max[1]) / 2;
    const probe = (w: number) => M.Manifold.cube([10, w, 8], true).translate([cb.max[0] - 8, cy, 5]);
    expect(s.intersect(probe(DEFAULT_BAG_CLIP.gap - 0.1)).volume()).toBeCloseTo(0, 2); // cabe na fenda
    expect(s.intersect(probe(DEFAULT_BAG_CLIP.gap + 1)).volume()).toBeGreaterThan(1); // mais largo bate
    expect(models[0].parts.map((p) => p.name)).toEqual(["Clipe", "Arte"]);
  });

  test("cortador + carimbo: lâmina mais alta que o relevo pela profundidade da marca", () => {
    const { models, warnings } = buildCutterStamp(ctx(ringArt()), DEFAULT_CUTTER_STAMP);
    expectPrintable(models);
    expect(warnings).toEqual([]);
    const m = models[0].parts[0].mesh;
    expect(b(m).max[2]).toBeCloseTo(DEFAULT_CUTTER_STAMP.plate + DEFAULT_CUTTER_STAMP.height);
    // corte horizontal logo abaixo do topo do relevo: só a lâmina + relevo; acima dele só a lâmina
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
    const top = DEFAULT_CUTTER_STAMP.plate + DEFAULT_CUTTER_STAMP.height - DEFAULT_CUTTER_STAMP.stampDepth;
    const areaAt = (z: number) => s.slice(z).area();
    expect(areaAt(top - 0.5)).toBeGreaterThan(areaAt(top + 0.5) * 1.5);
    expect(() => buildCutterStamp(ctx(ringArt()), { ...DEFAULT_CUTTER_STAMP, stampDepth: 20 })).toThrow(/menor que a altura/);
  });
});
