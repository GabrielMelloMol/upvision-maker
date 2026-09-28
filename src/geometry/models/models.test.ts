import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type CS, type ManifoldToplevel, type Solid } from "../manifold";
import { modelSize, modelVolume, volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import { buildBookmark, DEFAULT_BOOKMARK } from "./bookmark";
import { buildCakeTopper, DEFAULT_CAKE_TOPPER } from "./cakeTopper";
import type { ModelCtx } from "./common";
import { buildNfcKeychain, DEFAULT_NFC, nfcLayout } from "./nfcKeychain";
import { buildPenHolder, DEFAULT_PEN_HOLDER } from "./penHolder";
import { buildPixPlate, DEFAULT_PIX_PLATE } from "./pixPlate";
import { buildSpinner, DEFAULT_SPINNER } from "./spinner";
import { buildStamp, DEFAULT_STAMP, PEG_CLEARANCE, PEG_D } from "./stamp";
import { buildTrophy, DEFAULT_TROPHY } from "./trophy";
import { meshBounds } from "../bounds";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada letra é um retângulo 0,6h × h. */
const ctx = (art: CS | null = null): ModelCtx => ({
  M,
  art,
  text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null),
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (m: Model, name: string) => {
  const p = m.parts.find((x) => x.name === name);
  if (!p) throw new Error(`sem parte ${name}`);
  return p.mesh;
};
const pieces = (m: Mesh) => solid(m).decompose().length;
const overlap = (a: Mesh, b: Mesh) => solid(a).intersect(solid(b)).volume();
const bounds = (m: Mesh) => meshBounds([m])!;

describe("placa Pix", () => {
  const p = { ...DEFAULT_PIX_PLATE, key: "loja@exemplo.com", name: "Loja da Ana", city: "Curitiba", subtitle: "Loja da Ana" };

  test("placa clara + QR e textos escuros por cima, dentro da placa; suporte separado", () => {
    const { models, warnings } = buildPixPlate(ctx(), p);
    expect(models.map((m) => m.name)).toEqual(["Placa Pix", "Suporte"]);
    const [plate] = models;
    expect(plate.parts.map((x) => x.name)).toEqual(["Placa", "QR", "Texto"]);
    expect(new Set(plate.parts.slice(1).map((x) => x.color))).toEqual(new Set([p.darkColor]));
    const pb = bounds(part(plate, "Placa"));
    for (const name of ["QR", "Texto"]) {
      const b = bounds(part(plate, name));
      expect(b.min[2]).toBeCloseTo(p.thickness);
      expect(b.max[2]).toBeCloseTo(p.thickness + p.relief);
      expect(b.min[0]).toBeGreaterThan(pb.min[0]);
      expect(b.max[1]).toBeLessThan(pb.max[1]);
      expect(b.min[1]).toBeGreaterThan(pb.min[1]);
    }
    expect(pb.max[0] - pb.min[0]).toBeCloseTo(p.width);
    expect(warnings).toEqual([]);
  });

  test("suporte tem rasgo (menos volume que o bloco) e não encosta na placa", () => {
    const { models } = buildPixPlate(ctx(), p);
    const stand = models[1];
    const [w, d, h] = modelSize(stand);
    expect(modelVolume(stand)).toBeLessThan(w * d * h * 0.97);
    expect(bounds(stand.parts[0].mesh).max[1]).toBeLessThan(bounds(part(models[0], "Placa")).min[1]);
  });

  test("sem suporte e sem textos: só placa e QR; chave inválida vira erro", () => {
    const { models } = buildPixPlate(ctx(), { ...p, stand: false, title: "", subtitle: "" });
    expect(models).toHaveLength(1);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Placa", "QR"]);
    expect(() => buildPixPlate(ctx(), { ...p, key: "" })).toThrow();
  });
});

describe("topo de bolo", () => {
  test("fundo inteiriço com 2 palitos pontudos; texto por cima", () => {
    const [m] = buildCakeTopper(ctx(), DEFAULT_CAKE_TOPPER).models;
    const base = part(m, "Fundo");
    expect(pieces(base)).toBe(1);
    const b = bounds(base);
    const t = bounds(part(m, "Texto"));
    expect(t.min[2]).toBeCloseTo(DEFAULT_CAKE_TOPPER.thickness);
    expect(b.max[0] - b.min[0]).toBeGreaterThan(DEFAULT_CAKE_TOPPER.width);
    expect(t.min[1] - b.min[1]).toBeGreaterThan(DEFAULT_CAKE_TOPPER.stakeLength); // palitos abaixo do texto
    expect(overlap(base, part(m, "Texto"))).toBeCloseTo(0, 3);
  });

  test("1 palito, 1 linha; sem texto dá erro", () => {
    const [m] = buildCakeTopper(ctx(), { ...DEFAULT_CAKE_TOPPER, line2: "", stakes: 1 }).models;
    expect(pieces(part(m, "Fundo"))).toBe(1);
    expect(() => buildCakeTopper(ctx(), { ...DEFAULT_CAKE_TOPPER, line1: " " })).toThrow("Digite");
  });
});

describe("carimbo", () => {
  test("arte espelhada em relevo sobre a placa; cabo com pino que cabe no furo", () => {
    // arte assimétrica: um quadrado à direita da origem
    const art = M.CrossSection.square([10, 10]).translate([5, -5]);
    const { models } = buildStamp(ctx(art), DEFAULT_STAMP);
    expect(models.map((m) => m.name)).toEqual(["Carimbo", "Cabo"]);
    const a = bounds(part(models[0], "Arte"));
    expect(a.min[2]).toBeCloseTo(DEFAULT_STAMP.thickness);
    expect(a.max[2]).toBeCloseTo(DEFAULT_STAMP.thickness + DEFAULT_STAMP.relief);
    const handle = models[1].parts[0].mesh;
    const hb = bounds(handle);
    expect(hb.min[2]).toBeCloseTo(0);
    expect(pieces(handle)).toBe(1);
    // apoio plano na mesa (pomo achatado), não uma cúpula
    const r = Math.min(DEFAULT_STAMP.size * 0.22, 10);
    const foot = solid(handle).intersect(M.Manifold.cube([200, 200, 0.2], true).translate([hb.min[0] + 50, 0, 0.1])).volume() / 0.2;
    expect(foot).toBeGreaterThan(Math.PI * r ** 2 * 0.5);
    expect(hb.max[2] - 3).toBeGreaterThan(hb.min[2]); // pino em cima
    // furo atrás da placa: volume da placa = cilindro − furo
    const plateVol = volume(part(models[0], "Placa"));
    const full = Math.PI * (DEFAULT_STAMP.size / 2) ** 2 * DEFAULT_STAMP.thickness;
    const holeVol = full - plateVol;
    expect(holeVol).toBeGreaterThan(Math.PI * (PEG_D / 2) ** 2 * 3);
    expect(holeVol).toBeLessThan(Math.PI * ((PEG_D + PEG_CLEARANCE * 2) / 2) ** 2 * 4);
    art.delete();
  });

  test("espelha: arte à direita sai à esquerda; sem cabo não tem furo", () => {
    const art = M.CrossSection.square([10, 10]).translate([5, -5]);
    const withText = buildStamp(ctx(null), { ...DEFAULT_STAMP, text: "L", handle: false });
    expect(withText.models).toHaveLength(1);
    const r = M.CrossSection.union([art, M.CrossSection.square([4, 4]).translate([-20, -2])]);
    const { models } = buildStamp(ctx(r), { ...DEFAULT_STAMP, handle: false });
    const arte = solid(part(models[0], "Arte"));
    const left = arte.intersect(M.Manifold.cube([100, 100, 100], true).translate([-50, 0, 0])).volume();
    expect(left / arte.volume()).toBeGreaterThan(0.7); // a parte grande (à direita no desenho) foi para a esquerda
    const full = Math.PI * (DEFAULT_STAMP.size / 2) ** 2 * DEFAULT_STAMP.thickness;
    expect(volume(part(models[0], "Placa"))).toBeCloseTo(full, -1);
    [art, r].forEach((x) => x.delete());
  });
});

describe("marca-página", () => {
  test("tamanho, furo para o cordão e texto ao longo do comprimento", () => {
    const [m] = buildBookmark(ctx(), DEFAULT_BOOKMARK).models;
    const [w, l] = modelSize(m);
    expect(w).toBeCloseTo(DEFAULT_BOOKMARK.width);
    expect(l).toBeCloseTo(DEFAULT_BOOKMARK.length);
    const t = bounds(part(m, "Texto"));
    expect(t.max[1] - t.min[1]).toBeGreaterThan(t.max[0] - t.min[0]); // deitado no comprimento
    const noHole = buildBookmark(ctx(), { ...DEFAULT_BOOKMARK, hole: false }).models[0];
    expect(volume(part(noHole, "Base")) - volume(part(m, "Base"))).toBeGreaterThan(Math.PI * 2.5 ** 2 * DEFAULT_BOOKMARK.thickness * 0.9);
  });

  test("com desenho e sem texto também funciona; sem nada dá erro", () => {
    const art = M.CrossSection.circle(10, 32);
    expect(buildBookmark(ctx(art), { ...DEFAULT_BOOKMARK, text: "" }).models[0].parts).toHaveLength(2);
    expect(() => buildBookmark(ctx(), { ...DEFAULT_BOOKMARK, text: "" })).toThrow();
    art.delete();
  });
});

describe("porta-caneta", () => {
  for (const shape of ["round", "hex", "square"] as const) {
    test(`${shape}: copo inteiriço com fundo; texto em relevo na frente, sem invadir a parede`, () => {
      const p = { ...DEFAULT_PEN_HOLDER, shape };
      const [m] = buildPenHolder(ctx(), p).models;
      const body = part(m, "Copo");
      const text = part(m, "Texto");
      expect(pieces(body)).toBe(1);
      expect(modelSize(m)[2]).toBeCloseTo(p.height);
      expect(bounds(text).min[1]).toBeLessThan(bounds(body).min[1] + 0.01); // na frente (-Y)
      expect(bounds(text).max[1]).toBeLessThan(0);
      expect(volume(text)).toBeGreaterThan(10);
      expect(overlap(body, text)).toBeCloseTo(0, 1);
      // oco: bem menos volume que o sólido cheio
      expect(volume(body)).toBeLessThan(p.diameter ** 2 * p.height * 0.3);
    });
  }
});

describe("chaveiro giratório", () => {
  test("disco solto dentro da moldura (sem tocar), preso pelos pinos", () => {
    const [m] = buildSpinner(ctx(), DEFAULT_SPINNER).models;
    const frame = part(m, "Moldura");
    const disk = part(m, "Disco");
    expect(pieces(frame)).toBe(1);
    expect(pieces(disk)).toBe(1);
    expect(overlap(frame, disk)).toBeCloseTo(0, 4);
    // os pinos entram no disco: moldura invade o círculo do disco
    const rd = DEFAULT_SPINNER.diameter / 2 - 3.5 - DEFAULT_SPINNER.gap;
    const diskCyl = M.Manifold.cylinder(DEFAULT_SPINNER.thickness, rd, rd, 96);
    expect(solid(frame).intersect(diskCyl).volume()).toBeGreaterThan(2);
    // e o disco sozinho não sai: sem os pinos ele não teria furos
    expect(volume(disk)).toBeLessThan(Math.PI * rd ** 2 * DEFAULT_SPINNER.thickness - 2);
  });
});

describe("chaveiro NFC", () => {
  test("layout: bolsão entre 0,8 e 1,8 mm, pausa antes da camada de 2,0 mm (camada 0,2)", () => {
    expect(nfcLayout({ tagThickness: 0.8, layerHeight: 0.2 })).toEqual({ bottom: 0.8, top: 1.8, height: 3, pauseZ: 2 });
    const l = nfcLayout({ tagThickness: 0.8, layerHeight: 0.12 });
    expect(l.bottom).toBeCloseTo(0.84);
    expect(l.top).toBeCloseTo(1.92);
    expect(l.pauseZ).toBeCloseTo(2.04);
  });

  test("bolsão fechado (volume some por dentro) e pausa no resultado", () => {
    const r = buildNfcKeychain(ctx(), DEFAULT_NFC);
    expect(r.pauses).toEqual([2]);
    expect(r.warnings?.[0]).toContain("2,00 mm");
    const body = part(r.models[0], "Base");
    // casca externa + casca interna do bolsão (volume negativo = vazio fechado, sem abertura)
    const shells = solid(body).decompose().map((s) => s.volume()).sort((a, b) => a - b);
    expect(shells).toHaveLength(2);
    const pocket = Math.PI * ((DEFAULT_NFC.tagDiameter + 1.5) / 2) ** 2 * 1;
    expect(-shells[0]).toBeCloseTo(pocket, -1);
    expect(bounds(body).max[2]).toBeCloseTo(3);
  });

  test("tamanho pequeno demais para a tag dá erro claro", () => {
    expect(() => buildNfcKeychain(ctx(), { ...DEFAULT_NFC, size: 28 })).toThrow("pelo menos 31 mm");
  });
});

describe("troféu", () => {
  for (const shape of ["star", "circle", "shield", "hexagon"] as const) {
    test(`${shape}: placa com lingueta presa e base com rasgo do tamanho certo`, () => {
      const p = { ...DEFAULT_TROPHY, shape, baseText: "2026" };
      const { models } = buildTrophy(ctx(), p);
      expect(models.map((m) => m.name)).toEqual(["Placa", "Base"]);
      const plate = M.Manifold.union(models[0].parts.filter((x) => x.color === p.plateColor).map((x) => solid(x.mesh)));
      expect(plate.decompose().length).toBe(1);
      const baseMesh = part(models[1], "Base");
      const baseSolid = solid(baseMesh);
      const bb = bounds(baseMesh);
      const [cx, cy] = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2];
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(15);
      // a lingueta (largura × espessura × 8 mm) cabe no rasgo; 1 mm a mais já bate na base
      const tab = (extra: number) => M.Manifold.cube([p.size * 0.35 + extra, p.thickness + extra, 8], true).translate([cx, cy, 15 - 4]);
      expect(baseSolid.intersect(tab(0)).volume()).toBeCloseTo(0, 3);
      expect(baseSolid.intersect(tab(1)).volume()).toBeGreaterThan(1);
      const tabMesh = part(models[0], "Encaixe");
      expect(bounds(tabMesh).max[0] - bounds(tabMesh).min[0]).toBeCloseTo(p.size * 0.35);
      expect(bounds(part(models[1], "Texto da base")).max[1]).toBeLessThan(bb.min[1] + 0.01);
    });
  }
});
