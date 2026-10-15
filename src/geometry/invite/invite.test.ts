import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { modelSize, modelVolume } from "../testUtil";
import { buildInvite, buildInviteCard, DEFAULT_INVITE, foldMesh, PALETTES, paint, variations, type InviteParams } from "./build";
import { buildEnvelope } from "./envelope";
import { DEFAULT_ENVELOPE, type EnvelopeParams } from "./envelope";
import { laceRoles, connectIslands, type LacePattern } from "./lace";

let M: ManifoldToplevel;
const buf = readFileSync(resolve(__dirname, "../../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const fonts = { name: font, text: font };
const TEXT = { name: "Amanda", title: "XV anos", phrase: "Uma noite cheia de glamour\ne a minha ilustre presença", date: "06.12.26", place: "Palácio dos Lírios" };
const PAL = PALETTES[0].colors;
beforeAll(async () => {
  M = await getManifold();
});
const P = (env: Partial<EnvelopeParams> = {}, rest: Partial<InviteParams> = {}): InviteParams => ({ ...DEFAULT_INVITE, ...rest, env: { ...DEFAULT_ENVELOPE, ...env } });
const PATTERNS: Exclude<LacePattern, "custom">[] = ["floral", "leaves", "butterflies", "arabesque"];

describe("renda", () => {
  for (const pat of PATTERNS) {
    test(`${pat}: tem renda, sem sobreposição entre as funções`, () =>
      scoped((k) => {
        const r = laceRoles(M, k, pat, 110, 80, 3);
        const total = r.leaf.area() + r.flower.area() + r.stem.area();
        expect(total).toBeGreaterThan(300);
        const all = k(M.CrossSection.union([r.leaf, r.flower, r.stem]));
        expect(all.area()).toBeCloseTo(total, 1);
      }));
  }

  test("a mesma semente dá a mesma renda", () =>
    scoped((k) => {
      const a = laceRoles(M, k, "floral", 100, 70, 11), b = laceRoles(M, k, "floral", 100, 70, 11), c = laceRoles(M, k, "floral", 100, 70, 12);
      expect(a.leaf.area()).toBeCloseTo(b.leaf.area(), 6);
      expect(a.leaf.area()).not.toBeCloseTo(c.leaf.area(), 3);
    }));

  test("liga o pedaço solto ao corpo e tira o pó", () =>
    scoped((k) => {
      const body = k(M.CrossSection.square([40, 10], true));
      const island = k(k(M.CrossSection.square([6, 6], true)).translate([0, 20]));
      const dust = k(k(M.CrossSection.square([0.3, 0.3], true)).translate([30, 30]));
      const r = connectIslands(M, k, k(M.CrossSection.union([body, island, dust])), 0.8, 1);
      expect(r.bridged).toBe(1);
      expect(r.dropped).toBe(1);
      expect(r.cs.decompose().length).toBe(1);
    }));
});

describe("convite", () => {
  test("padrão: envelope em cruz com pausa do tule, cartão e peças", () => {
    const out = buildInvite(M, P(), PAL, TEXT, fonts, null);
    const [w, h, z] = modelSize(out.envelope);
    expect(w).toBeGreaterThan(232); // cruz: corpo + 2 abas de meia largura, menos o vão das pontas
    expect(w).toBeLessThan(240);
    expect(h).toBeGreaterThan(172);
    expect(h).toBeLessThan(180);
    expect(z).toBeCloseTo(1.2, 3);
    expect(out.pauses).toEqual([0.8]); // tule em 0,6 mm: pausa antes da 4ª camada
    expect(out.info.tuleLayer).toBe(3);
    expect(out.card.parts.length).toBe(3);
    expect(out.pieces.length).toBe(3); // 1 borboleta + 2 flores
    expect(modelVolume(out.envelope)).toBeGreaterThan(5000);
  });
});

describe("cores", () => {
  test("variações repetem as paletas na ordem", () => {
    const v = variations(["A", "B", "C"], ["rosa", "lilas"]);
    expect(v.map((x) => x.palette.id)).toEqual(["rosa", "lilas", "rosa"]);
  });
  test("pintar troca a cor por função; com 2 tons a flor leva a cor da folha", () => {
    const out = buildInvite(M, P(), PAL, TEXT, fonts, null);
    const lilac = PALETTES[1].colors;
    const three = paint([out.envelope], lilac, 3)[0].parts.map((q) => q.color);
    expect(three).toContain(lilac.flower);
    const two = paint([out.envelope], lilac, 2)[0].parts.map((q) => q.color);
    expect(two).not.toContain(lilac.flower);
  });
});

const fold = (msg: string, f: () => void) => test(msg, f);

describe("envelope", () => {
  // peças de cores diferentes se encostam pela face: a conta é feita no plano, engordando 0,02 mm para colar o que só encosta
  const regionBodies = (out: ReturnType<typeof buildEnvelope>, k: <D extends { delete(): void }>(o: D) => D) =>
    out.regions.map((r) => {
      const solids = r.parts.map((q) => k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: q.mesh.positions, triVerts: q.mesh.indices }))));
      const plane = k(k(M.Manifold.union(solids)).slice(0.2));
      return k(plane.offset(0.02, "Miter")).decompose().map(k).filter((c) => c.area() > 1).length;
    });

  test("sem tule: cada região (corpo e abas) é uma peça só, sem pedaço solto", () =>
    scoped((k) => {
      const out = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, tulle: false }, PAL, null);
      expect(out.pauseZ).toBeNull();
      expect(out.height).toBeCloseTo(1.6, 3);
      expect(regionBodies(out, k)).toEqual([1, 1, 1, 1, 1]);
    }));

  test("com tule: pausa no topo da camada depois do tule (tule em 1,0 mm, camada 0,2 → pausa em 1,2)", () =>
    scoped((k) => {
      const out = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, thickness: 1.6, tuleAt: 1 }, PAL, null);
      expect(out.tuleZ).toBeCloseTo(1, 6);
      expect(out.pauseZ).toBeCloseTo(1.2, 6);
    }));

  test("o tule perto do topo avisa que faltam camadas por cima", () =>
    scoped((k) => {
      const out = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, thickness: 1.2, tuleAt: 1 }, PAL, null);
      expect(out.warnings.join(" ")).toMatch(/pelo menos 2 camadas/);
    }));

  test("dobradiça fina vira uma tira de 0,4 mm só nas camadas de baixo; só o tule não tem", () =>
    scoped((k) => {
      const thin = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, hinge: "thin" }, PAL, null);
      const none = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, hinge: "tulle" }, PAL, null);
      const zs = (o: typeof thin) => o.parts.map((q) => Math.max(...[...q.mesh.positions].filter((_, i) => i % 3 === 2)));
      expect(zs(thin).some((z) => Math.abs(z - thin.hingeT) < 1e-4)).toBe(true);
      expect(zs(none).some((z) => Math.abs(z - none.hingeT) < 1e-4)).toBe(false);
    }));

  test("renda própria (SVG): o que está solto é ligado, sem tule", () =>
    scoped((k) => {
      // um aro (que encosta na moldura) com um ponto solto no meio: sem tule o app liga o ponto
      const ring = k(k(M.CrossSection.circle(30, 48)).subtract(k(M.CrossSection.circle(26, 48))));
      const dots = k(M.CrossSection.union([ring, k(M.CrossSection.circle(5, 32))]));
      const out = buildEnvelope(M, k, { ...DEFAULT_ENVELOPE, pattern: "custom", tulle: false }, PAL, dots);
      expect(out.bridged).toBeGreaterThan(0);
      expect(regionBodies(out, k)).toEqual([1, 1, 1, 1, 1]);
    }));
});

describe("dobra em 3D", () => {
  fold("180° espelha a aba por cima da dobradiça e vira o lado", () => {
    // um ponto da aba de cima, a 10 mm da dobradiça (y = 45) e 0,6 mm acima da mesa
    const mesh = { positions: new Float32Array([5, 55, 0.6]), indices: new Uint32Array([0, 0, 0]) };
    const r = foldMesh(mesh, { id: "top", out: [0, 1], hinge: [0, 45] }, 180, 2);
    expect(r.positions[0]).toBeCloseTo(5, 5);
    expect(r.positions[1]).toBeCloseTo(35, 4); // 10 mm para dentro do corpo
    expect(r.positions[2]).toBeCloseTo(2 * 2 - 0.6, 5);
  });
  fold("0° não mexe e 90° levanta a aba na vertical", () => {
    const mesh = { positions: new Float32Array([0, 55, 2]), indices: new Uint32Array([0, 0, 0]) };
    const same = foldMesh(mesh, { id: "top", out: [0, 1], hinge: [0, 45] }, 0, 2);
    expect([...same.positions]).toEqual([0, 55, 2]);
    const up = foldMesh(mesh, { id: "top", out: [0, 1], hinge: [0, 45] }, 90, 2);
    expect(up.positions[1]).toBeCloseTo(45, 4);
    expect(up.positions[2]).toBeCloseTo(12, 4);
  });
  test("fechado: as quatro abas ficam por cima do cartão e das peças em relevo por cima delas", () => {
    const out = buildInvite(M, P(), PAL, TEXT, fonts, null);
    const zMax = (m: { parts: { mesh: { positions: Float32Array } }[] }) => Math.max(...m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 2)));
    const zMin = (m: { parts: { mesh: { positions: Float32Array } }[] }) => Math.min(...m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 2)));
    const card = out.closed.find((m) => m.name.startsWith("Cartão"))!;
    const flaps = out.closed.filter((m) => m.name.startsWith("Aba"));
    expect(flaps).toHaveLength(4);
    for (const f of flaps) expect(zMin(f)).toBeGreaterThan(zMax(card) - 1e-3);
    const butter = out.closed.find((m) => m.name.startsWith("Borboleta"))!;
    expect(zMin(butter)).toBeGreaterThan(Math.max(...flaps.map(zMax)) - 1e-3);
    expect(out.closed.every((m) => m.previewOnly)).toBe(true);
    expect(out.open.every((m) => m.previewOnly)).toBe(true);
  });
});

describe("cartão", () => {
  test("o texto cabe na placa com margem e tem o tamanho que cabe no envelope com folga", () => {
    const out = buildInvite(M, P({ w: 100, h: 80 }), PAL, TEXT, fonts, null);
    expect(out.info.card.w).toBeCloseTo(100 - 2 * (3 + 1), 6);
    expect(out.info.card.h).toBeCloseTo(80 - 2 * (3 + 1), 6);
    const plate = out.card.parts.find((q) => q.name === "Cartão")!;
    const text = out.card.parts.filter((q) => q.name !== "Cartão");
    const ext = (pos: Float32Array, axis: number) => [Math.min(...[...pos].filter((_, i) => i % 3 === axis)), Math.max(...[...pos].filter((_, i) => i % 3 === axis))];
    const [px0, px1] = ext(plate.mesh.positions, 0), [py0, py1] = ext(plate.mesh.positions, 1);
    for (const t of text) {
      const [x0, x1] = ext(t.mesh.positions, 0), [y0, y1] = ext(t.mesh.positions, 1);
      expect(x0).toBeGreaterThan(px0 + 5);
      expect(x1).toBeLessThan(px1 - 5);
      expect(y0).toBeGreaterThan(py0 + 5);
      expect(y1).toBeLessThan(py1 - 5);
    }
  });

  test("relevo: o texto sobe 0,6 mm da placa; embutido: fica rente à face", () => {
    const relief = buildInviteCard(M, P(), PAL, TEXT, fonts).card;
    const zTop = (m: typeof relief) => Math.max(...m.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 2)));
    expect(zTop(relief)).toBeCloseTo(1.8, 4);
    const inlay = buildInviteCard(M, P({}, { card: { ...DEFAULT_INVITE.card, style: "inlay" } }), PAL, TEXT, fonts).card;
    expect(zTop(inlay)).toBeCloseTo(1.2, 4);
  });

  test("linha mais larga que o cartão é reduzida e avisa", () => {
    const r = buildInviteCard(M, P({ w: 70, h: 50 }), PAL, { ...TEXT, name: "Maria Eduarda Albuquerque de Souza" }, fonts);
    expect(r.warnings.join(" ")).toMatch(/foi reduzida|reduzi tudo/);
  });

  test("a troca de nome nas variações só muda o cartão; envelope e peças só mudam de cor", () => {
    const base = buildInvite(M, P(), PAL, TEXT, fonts, null);
    const lilac = PALETTES[1].colors;
    const env = paint([base.envelope], lilac, 3)[0];
    expect(env.parts.map((q) => q.mesh.positions.length)).toEqual(base.envelope.parts.map((q) => q.mesh.positions.length));
    const a = buildInviteCard(M, P(), lilac, { ...TEXT, name: "Júlia" }, fonts).card;
    expect(a.parts.find((q) => q.name === "Cartão")!.color).toBe(lilac.plate);
  });
});

describe("borboleta", () => {
  test("em relevo: peça à parte para colar, em duas camadas de tons diferentes", () => {
    const out = buildInvite(M, P({}, { butterfly: "relief" }), PAL, TEXT, fonts, null);
    const b = out.pieces.find((m) => m.name.startsWith("Borboleta"))!;
    expect(b.parts.map((q) => q.name)).toEqual(["Borboleta", "Detalhe"]);
    expect(b.parts[0].color).not.toBe(b.parts[1].color);
  });
  test("asas levantadas: sem peça de borboleta (as asas saem planas no envelope), e sem tule volta ao relevo com aviso", () => {
    const wings = buildInvite(M, P({}, { butterfly: "wings" }), PAL, TEXT, fonts, null);
    expect(wings.pieces.some((m) => m.name.startsWith("Borboleta"))).toBe(false);
    const noTulle = buildInvite(M, P({ tulle: false }, { butterfly: "wings" }), PAL, TEXT, fonts, null);
    expect(noTulle.pieces.some((m) => m.name.startsWith("Borboleta"))).toBe(true);
    expect(noTulle.warnings.join(" ")).toMatch(/Asas levantadas precisam do tule/);
  });
});
