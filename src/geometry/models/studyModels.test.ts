import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { arcTextToCrossSection, textToCrossSection } from "../text";
import { sq, volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import { buildBusinessCard, DEFAULT_BUSINESS_CARD } from "./businessCard";
import { MissingInput, type ModelCtx } from "./common";
import { buildLineArtStand, DEFAULT_LINE_ART } from "./lineArtStand";
import { buildMirrorKeychain, DEFAULT_MIRROR } from "./mirrorKeychain";
import { buildPetTag, DEFAULT_PET_TAG, type PetShape } from "./petTag";
import { buildProfessionPlaque, DEFAULT_PROFESSION } from "./professionPlaque";
import { buildQrList, buildQrPlate, DEFAULT_QR_LIST, DEFAULT_QR_PLATE, guessKind, qrPlatePayload } from "./qrPlate";
import { buildSnowflake, DEFAULT_SNOWFLAKE, rng } from "./snowflake";

let M: ManifoldToplevel;
const b = readFileSync(resolve(__dirname, "../../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null, withArc = true): ModelCtx => ({
  M,
  art,
  artLayers: null,
  text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null),
  arc: withArc ? (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, font, s, h, r, side) : null) : undefined,
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

describe("placas QR", () => {
  test("conteúdo por tipo e palpite do tipo na lista", () => {
    expect(qrPlatePayload("wifi", "Loja", "12345678")).toBe("WIFI:T:WPA;S:Loja;P:12345678;;");
    expect(qrPlatePayload("wifi", "Aberta")).toBe("WIFI:T:nopass;S:Aberta;;");
    expect(qrPlatePayload("whatsapp", "21 99999-0000")).toBe("https://wa.me/5521999990000");
    expect(guessKind("@loja")).toBe("instagram");
    expect(guessKind("(21) 99999-0000")).toBe("whatsapp");
    expect(guessKind("loja.com.br")).toBe("link");
    expect(() => qrPlatePayload("link", "  ")).toThrow(MissingInput);
  });

  test("placa: ícone, título, QR e frase em cima da placa; suporte separado", () => {
    const { models } = buildQrPlate(ctx(), DEFAULT_QR_PLATE);
    printable(models);
    expect(models.map((m) => m.name)).toEqual(["Wi-Fi", "Suporte"]);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Placa", "QR", "Texto"]);
    const plate = bb(part(models[0], "Placa").mesh);
    for (const n of ["QR", "Texto"]) {
      const x = bb(part(models[0], n).mesh);
      expect(x.min[2]).toBeCloseTo(DEFAULT_QR_PLATE.thickness);
      expect(x.max[1]).toBeLessThan(plate.max[1]);
      expect(x.min[1]).toBeGreaterThan(plate.min[1]);
    }
  });

  test("lista: um QR por link preenchido; lado a lado é mais largo que empilhado", () => {
    const h = buildQrList(ctx(), DEFAULT_QR_LIST).models[0];
    const v = buildQrList(ctx(), { ...DEFAULT_QR_LIST, layout: "vertical" }).models[0];
    printable([h, v]);
    expect(h.parts.filter((p) => p.name.startsWith("QR"))).toHaveLength(3);
    const [hb, vb] = [bb(part(h, "Placa").mesh), bb(part(v, "Placa").mesh)];
    expect(hb.max[0] - hb.min[0]).toBeGreaterThan(vb.max[0] - vb.min[0]);
    expect(() => buildQrList(ctx(), { ...DEFAULT_QR_LIST, link1: "", link2: "", link3: "" })).toThrow(MissingInput);
  });
});

describe("desenho em pé", () => {
  test("sem desenho usa o exemplo; desenho + base com texto, peça única", () => {
    const { models, warnings } = buildLineArtStand(ctx(), DEFAULT_LINE_ART);
    printable(models);
    expect(models.map((m) => m.name)).toEqual(["Desenho", "Base"]);
    expect(solid(models[0].parts[0].mesh).decompose()).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  test("traço solto é avisado (e só a parte principal vai para a placa)", () => {
    const art = new M.CrossSection([sq(10), sq(2, 0, 30)], "NonZero"); // quadrado + ilha acima
    const { models, warnings } = buildLineArtStand(ctx(art), { ...DEFAULT_LINE_ART, stroke: 0 });
    expect(warnings?.[0]).toMatch(/1 traço\(s\) solto/);
    expect(solid(models[0].parts[0].mesh).decompose()).toHaveLength(1);
  });
});

describe("tag de pet", () => {
  test.each(["bone", "paw", "circle", "heart", "shield"] as PetShape[])("formato %s: peça única com furo, nome na frente e verso embutido rente embaixo", (shape) => {
    const { models } = buildPetTag(ctx(), { ...DEFAULT_PET_TAG, shape });
    printable(models);
    const tag = solid(part(models[0], "Tag").mesh);
    expect(tag.decompose()).toHaveLength(1);
    expect(tag.genus()).toBeGreaterThanOrEqual(1); // furo da argola
    const back = bb(part(models[0], "Verso").mesh);
    expect(back.min[2]).toBeCloseTo(0);
    expect(back.max[2]).toBeCloseTo(0.6);
    expect(tag.intersect(solid(part(models[0], "Verso").mesh)).volume()).toBeCloseTo(0, 2); // encaixa no rebaixo
  }, 20_000);

  test("sem nome: estado vazio", () => {
    expect(() => buildPetTag(ctx(), { ...DEFAULT_PET_TAG, name: "" })).toThrow(MissingInput);
  });
});

describe("placa de profissão", () => {
  test("3 peças; símbolo cabe no rebaixo da placa; base com bolsões de peso e pausa", () => {
    const out = buildProfessionPlaque(ctx(), DEFAULT_PROFESSION);
    printable(out.models);
    expect(out.models.map((m) => m.name)).toEqual(["Placa", "Símbolo", "Base"]);
    expect(out.pauses).toHaveLength(1);
    expect(out.pauses![0]).toBeGreaterThan(8); // acima do bolsão de 2 + 6 mm
    const noWeight = buildProfessionPlaque(ctx(), { ...DEFAULT_PROFESSION, weight: false });
    expect(noWeight.pauses).toEqual([]);
    expect(volume(noWeight.models[2].parts[0].mesh)).toBeGreaterThan(volume(out.models[2].parts[0].mesh));
  });
});

describe("cartão de visita", () => {
  test("85 × 54 com QR; pausas de tecido e NFC em ordem", () => {
    const plain = buildBusinessCard(ctx(), DEFAULT_BUSINESS_CARD);
    printable(plain.models);
    const card = bb(part(plain.models[0], "Cartão").mesh);
    expect([card.max[0] - card.min[0], card.max[1] - card.min[1]]).toEqual([expect.closeTo(85, 1), expect.closeTo(54, 1)]);
    expect(plain.pauses).toEqual([]);
    const all = buildBusinessCard(ctx(), { ...DEFAULT_BUSINESS_CARD, fabric: true, nfc: true, thickness: 3 });
    expect(all.pauses).toEqual([0.6, 2]);
    expect(() => buildBusinessCard(ctx(), { ...DEFAULT_BUSINESS_CARD, nfc: true, thickness: 1.6 })).toThrow(/pelo menos 3/);
  });
});

describe("chaveiro espelho", () => {
  test("bolsão cabe o espelho com folga; frases em arco no aro; verso embutido com desenho", () => {
    const { models } = buildMirrorKeychain(ctx(new M.CrossSection([sq(10)], "NonZero")), DEFAULT_MIRROR);
    printable(models);
    const body = solid(part(models[0], "Chaveiro").mesh);
    const mirror = M.Manifold.cylinder(DEFAULT_MIRROR.mirrorThickness, DEFAULT_MIRROR.mirror / 2, DEFAULT_MIRROR.mirror / 2, 96).translate([0, 0, 1.6]);
    expect(body.intersect(mirror).volume()).toBeCloseTo(0, 2);
    const phrases = bb(part(models[0], "Frases").mesh);
    expect(phrases.max[1]).toBeGreaterThan(DEFAULT_MIRROR.mirror / 2); // no aro, não em cima do espelho
    expect(bb(part(models[0], "Verso").mesh).min[2]).toBeCloseTo(0);
  });

  test("sem texto em arco disponível: frases retas e aviso", () => {
    const { warnings, models } = buildMirrorKeychain(ctx(null, false), DEFAULT_MIRROR);
    printable(models);
    expect(warnings?.join()).toMatch(/saem retas/);
  });
});

describe("floco de neve", () => {
  test("mesmo número = mesmo floco; número diferente = outro; peça única com argola", () => {
    expect([rng(5)(), rng(5)()]).toEqual([rng(5)(), rng(5)()].map(() => rng(5)()));
    const a = buildSnowflake(ctx(), DEFAULT_SNOWFLAKE).models[0];
    const again = buildSnowflake(ctx(), DEFAULT_SNOWFLAKE).models[0];
    const other = buildSnowflake(ctx(), { ...DEFAULT_SNOWFLAKE, seed: 8 }).models[0];
    printable([a, other]);
    expect(volume(part(a, "Floco").mesh)).toBeCloseTo(volume(part(again, "Floco").mesh), 6);
    expect(volume(part(a, "Floco").mesh)).not.toBeCloseTo(volume(part(other, "Floco").mesh), 1);
    const flake = solid(part(a, "Floco").mesh);
    expect(flake.decompose()).toHaveLength(1);
    expect(flake.genus()).toBeGreaterThanOrEqual(1); // argola
  });
});
