import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type CS, type ManifoldToplevel, type Solid } from "./manifold";
import { scoped } from "./shape2d";
import { alignPoints, buildStamp, DEFAULT_STAMP, minEdge, plateThickness, stampPlates, type StampParams } from "./stamp";
import { buildStampArt, DEFAULT_ART, fixThinStrokes, NO_MOVE, type StampArtInput } from "./stampArt";
import { modelSize } from "./testUtil";

let M: ManifoldToplevel;
const b = readFileSync(resolve(__dirname, "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff"));
const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
beforeAll(async () => {
  M = await getManifold();
});

type K = <D extends { delete(): void }>(o: D) => D;

/** Desenho assimétrico (um "L" e uma bolinha), deslocado do centro: se espelho ou deslocamento errassem, as peças não casariam. */
const asym = (k: K, dx = 0, dy = 0): CS => {
  const l = k(new M.CrossSection([[[-8, -6], [-3, -6], [-3, 3], [2, 3], [2, 6], [-8, 6]]], "NonZero"));
  const dot = k(k(M.CrossSection.circle(3, 32)).translate([8, -2]));
  return k(k(l.add(dot)).translate([dx, dy]));
};

/** Fecha as placas como um livro: a de baixo gira sobre o eixo x = 0 e para sobre a de cima, com o papel no meio. */
function closed(bottom: Solid, T: number, paper: number, k: K): Solid {
  const mirrored = k(bottom.mirror([1, 0, 0]));
  const flipped = k(mirrored.mirror([0, 0, 1]));
  return k(flipped.translate([0, 0, 2 * T + paper]));
}

const overlapVolume = (a: Solid, b2: Solid, k: K) => k(a.intersect(b2)).volume();

/** O que sobe da face da placa de cima (relevo e pinos). */
const aboveFace = (top: Solid, T: number, k: K): Solid => k(top.trimByPlane([0, 0, 1], T));
/** Só o relevo: o que sobe da face dentro da área carimbada (os pinos ficam na borda, fora dela). */
const reliefOnly = (top: Solid, T: number, cx: number, p: StampParams, k: K): Solid => {
  const zone = p.shape === "round" ? M.Manifold.cylinder(20, p.w / 2, p.w / 2, 64, true) : M.Manifold.cube([p.w, p.h, 20], true);
  const area = k(k(zone).translate([cx, 0, T + 10]));
  return k(aboveFace(top, T, k).intersect(area));
};

const P = (patch: Partial<StampParams> = {}): StampParams => ({ ...DEFAULT_STAMP, ...patch });

describe("carimbo: as duas placas casam", () => {
  for (const [name, patch] of [
    ["retângulo com pinos", {}],
    ["redondo com pinos", { shape: "round", w: 40 }],
    ["retângulo com ímãs (2)", { align: "magnets" }],
    ["retângulo com ímãs (4)", { align: "magnets", magCount: 4 }],
    ["com dobradiça", { align: "hinge" }],
    ["papel grosso e relevo alto", { paper: 1, relief: 2.5 }],
    ["sem inclinação", { draft: 0 }],
  ] as [string, Partial<StampParams>][]) {
    test(`${name}: o relevo (deslocado do centro) cabe na cavidade espelhada, com a folga do papel`, () =>
      scoped((k) => {
        const p = P(patch);
        const art = asym(k, 6, -4);
        const { top, bottom, T, cx } = stampPlates(M, art, p, k);
        const relief = reliefOnly(top, T, cx, p, k);
        const lid = closed(bottom, T, p.paper, k);
        // fechado sobre o papel: nada se toca
        expect(overlapVolume(relief, lid, k)).toBeLessThan(1e-6);
        // sobe o relevo quase a folga: ainda não encosta no fundo da cavidade...
        const lift = p.paper - 0.05;
        expect(overlapVolume(k(relief.translate([0, 0, lift])), lid, k)).toBeLessThan(1e-6);
        // ...e um pouco além encosta: a folga do fundo é a do papel, não maior
        expect(overlapVolume(k(relief.translate([0, 0, p.paper + 0.1])), lid, k)).toBeGreaterThan(0.01);
        // folga dos lados: cabe deslocado quase a folga em qualquer direção, e encosta além
        for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const d = p.paper - 0.05;
          expect(overlapVolume(k(relief.translate([sx * d, sy * d, 0])), lid, k)).toBeLessThan(1e-6);
          const over = p.paper + 0.3;
          expect(overlapVolume(k(relief.translate([sx * over, sy * over, 0])), lid, k)).toBeGreaterThan(0.001);
        }
      }));
  }

  test("o deslocamento do desenho vale para as duas placas (o bug do modelo de referência)", () =>
    scoped((k) => {
      for (const dx of [0, 7, -9]) {
        const art = asym(k, dx, 3);
        const p = P();
        const { top, bottom, T } = stampPlates(M, art, p, k);
        const lid = closed(bottom, T, p.paper, k);
        expect(overlapVolume(aboveFace(top, T, k), lid, k)).toBeLessThan(1e-6);
        // a cavidade fica onde está o relevo: deslocar uma das placas 1,5 mm faz o relevo bater
        expect(overlapVolume(k(aboveFace(top, T, k).translate([1.5, 0, 0])), lid, k)).toBeGreaterThan(0.01);
      }
    }));
});

describe("carimbo: alinhamento", () => {
  test("pinos entram nos furos e o furo não é folgado demais", () =>
    scoped((k) => {
      const p = P();
      const art = asym(k);
      const { top, bottom, T } = stampPlates(M, art, p, k);
      const lid = closed(bottom, T, p.paper, k);
      const pins = aboveFace(top, T, k);
      // o relevo está longe dos pinos, então qualquer batida vem dos pinos
      expect(overlapVolume(pins, lid, k)).toBeLessThan(1e-6);
      // o pino fica no furo com folga pequena: 0,6 mm de lado já bate
      expect(overlapVolume(k(pins.translate([p.pinFit + 0.4, 0, 0])), lid, k)).toBeGreaterThan(0.001);
    }));

  test("pinos ficam na borda da placa, fora da área carimbada: o papel não é furado", () => {
    for (const patch of [{}, { shape: "round" as const, w: 40 }, { align: "magnets" as const, magCount: 4 as const }, { align: "hinge" as const }]) {
      const p = P(patch);
      const edge = Math.max(p.edge, minEdge(p));
      for (const [x, y] of alignPoints(p, edge)) {
        const r = p.shape === "round" ? Math.hypot(x, y) - p.w / 2 : Math.max(Math.abs(x) - p.w / 2, Math.abs(y) - p.h / 2);
        // o centro do pino/ímã está além da área e a folga até ela cobre o raio do pino
        expect(r).toBeGreaterThan(2.2 + p.pinFit + 0.5);
      }
    }
  });

  test("pinos são cones sem suporte: o furo alarga para cima na mesa e o pino afina para cima", () => {
    const p = P();
    const pts = alignPoints(p, 9);
    expect(pts).toHaveLength(2);
    // na diagonal: o espelho leva um ponto para o outro canto, nunca para cima do mesmo
    expect(pts[0][0]).toBe(-pts[1][0]);
    expect(pts[0][1]).toBe(-pts[1][1]);
  });

  test("ímãs: bolsos abertos por baixo, com parede de pelo menos 0,8 mm até a face", () =>
    scoped((k) => {
      const p = P({ align: "magnets" });
      const art = asym(k);
      const { top, bottom, T } = stampPlates(M, art, p, k);
      expect(T - (p.magH + 0.1)).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(plateThickness(p)).toBeGreaterThanOrEqual(p.magH + 0.1 + 0.8);
      // bolsos existem nas duas placas e não furam a face: ambas continuam uma peça só
      for (const s of [top, bottom]) expect(s.decompose().length).toBe(1);
      // o pino não existe no modo ímã
      expect(k(top.trimByPlane([0, 0, 1], T)).volume()).toBeLessThan(asymVolume(art) * p.relief * 1.2);
    }));

  test("ímãs: 4 nos cantos formam as duas diagonais; as bordas crescem para o ímã caber", () => {
    const p = P({ align: "magnets", magCount: 4, edge: 5 });
    expect(alignPoints(p, 9)).toHaveLength(4);
    expect(minEdge(p)).toBeCloseTo(p.magD + p.magTol + 2.4);
  });

  test("dobradiça: as duas placas e o filme são um corpo só e o filme é fino", () =>
    scoped((k) => {
      const p = P({ align: "hinge" });
      const { top, bottom, film, T } = stampPlates(M, asym(k), p, k);
      expect(film).not.toBeNull();
      const whole = k(M.Manifold.union([top, bottom, film!]));
      expect(whole.decompose().length).toBe(1);
      const fb = film!.boundingBox();
      expect(fb.max[2] - fb.min[2]).toBeCloseTo(p.hingeFilm);
      expect(fb.min[2]).toBeCloseTo(0);
      // as placas ficam a hingeGap uma da outra, sem sobreposição com o filme (volumes separados)
      expect(overlapVolume(top, film!, k)).toBeLessThan(1e-6);
      expect(overlapVolume(bottom, film!, k)).toBeLessThan(1e-6);
      const tb = top.boundingBox();
      const bb = bottom.boundingBox();
      expect(tb.min[0] - bb.max[0]).toBeCloseTo(p.hingeGap);
      expect(T).toBeGreaterThan(0);
    }));
});

const asymVolume = (art: CS) => art.area();

describe("carimbo: modelos", () => {
  test("duas placas imprimíveis planas, mais a prévia do papel que não vai para o arquivo", () =>
    scoped((k) => {
      const out = buildStamp(M, asym(k), P());
      expect(out.models.map((m) => m.name)).toEqual(["Placa com relevo", "Placa com cavidade", "Papel gravado (prévia)"]);
      expect(out.models.filter((m) => !m.previewOnly)).toHaveLength(2);
      expect(out.models[2].previewOnly).toBe(true);
      for (const m of out.models.slice(0, 2)) expect(Math.min(...m.parts[0].mesh.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(0, 5);
      const [w, h, z] = modelSize(out.models[0]);
      expect(w).toBeCloseTo(50 + 2 * 9, 0);
      expect(h).toBeCloseTo(30 + 2 * 9, 0);
      expect(z).toBeGreaterThan(4); // placa + relevo ou pinos
      // a placa de baixo não tem relevo: só a espessura da placa
      expect(modelSize(out.models[1])[2]).toBeCloseTo(4, 1);
    }));

  test("com dobradiça sai um objeto só, em 3 partes", () =>
    scoped((k) => {
      const out = buildStamp(M, asym(k), P({ align: "hinge" }));
      const printable = out.models.filter((m) => !m.previewOnly);
      expect(printable).toHaveLength(1);
      expect(printable[0].parts.map((x) => x.name)).toEqual(["Placa com relevo", "Placa com cavidade", "Dobradiça"]);
    }));

  test("relevo alto engrossa a placa com aviso", () =>
    scoped((k) => {
      const out = buildStamp(M, asym(k), P({ relief: 3.5, plate: 3 }));
      expect(out.warnings.join(" ")).toMatch(/Aumentei a placa para 4,7 mm/);
    }));

  test("desenho vazio dá erro claro", () =>
    scoped((k) => {
      expect(() => buildStamp(M, k(k(M.CrossSection.square(2)).subtract(M.CrossSection.square(2))), P())).toThrow("vazio");
    }));
});

const artInput = (patch: Partial<StampArtInput> = {}): StampArtInput => ({ shape: "rect", w: 50, h: 30, logo: null, lines: ["Ana & Bruno"], font, ...DEFAULT_ART, ...patch });

describe("arte do carimbo", () => {
  test("texto enche a área e fica centrado", () => {
    const { art, warnings } = buildStampArt(M, artInput());
    try {
      const bb = art.bounds();
      expect(bb.max[0] - bb.min[0]).toBeGreaterThan(40);
      expect(bb.max[0] - bb.min[0]).toBeLessThanOrEqual(47.1);
      expect(Math.abs(bb.min[0] + bb.max[0])).toBeLessThan(0.5);
      expect(warnings).toEqual([]);
    } finally {
      art.delete();
    }
  });

  test("selo redondo: moldura de dois anéis, texto em arco e conteúdo dentro do anel interno", () => {
    const { art, warnings } = buildStampArt(M, artInput({ shape: "round", w: 40, h: 40, frame: "seal", arcTop: "CASAMENTO", arcBottom: "12.10.2027", lines: ["A&B"] }));
    try {
      expect(warnings).toEqual([]);
      const polys = art.toPolygons();
      const r = Math.max(...polys.flat().map(([x, y]) => Math.hypot(x, y)));
      expect(r).toBeLessThanOrEqual(20 + 1e-6);
      expect(r).toBeGreaterThan(19.5);
      // anéis + texto em volta + conteúdo: várias peças
      expect(art.decompose().length).toBeGreaterThan(4);
    } finally {
      art.delete();
    }
  });

  test("moldura em linha e escala do conteúdo", () => {
    const base = buildStampArt(M, artInput({ frame: "line" }));
    const small = buildStampArt(M, artInput({ frame: "line", scale: 50 }));
    try {
      const bb = base.art.bounds();
      expect(bb.max[0]).toBeCloseTo(25, 5);
      expect(bb.max[1]).toBeCloseTo(15, 5);
      // a moldura é a mesma; o texto de dentro encolhe
      expect(small.art.area()).toBeLessThan(base.art.area());
    } finally {
      base.art.delete();
      small.art.delete();
    }
  });

  test("deslocamento fora da área avisa", () => {
    const { art, warnings } = buildStampArt(M, artInput({ move: { ...NO_MOVE, dx: 20 } }));
    art.delete();
    expect(warnings.join(" ")).toMatch(/passa da área/);
  });

  test("logo e texto juntos, empilhados ou lado a lado", () =>
    scoped((k) => {
      const logo = k(M.CrossSection.circle(10, 48));
      for (const layout of ["stack", "side"] as const) {
        const { art } = buildStampArt(M, artInput({ logo, layout, w: 60, h: 60 }));
        try {
          expect(art.decompose().length).toBeGreaterThan(2);
        } finally {
          art.delete();
        }
      }
      const stacked = buildStampArt(M, artInput({ logo, layout: "stack", w: 60, h: 60 }));
      const side = buildStampArt(M, artInput({ logo, layout: "side", w: 60, h: 60 }));
      try {
        // empilhado é mais alto que largo em relação ao lado a lado
        const a = stacked.art.bounds(), s = side.art.bounds();
        expect((a.max[1] - a.min[1]) / (a.max[0] - a.min[0])).toBeGreaterThan((s.max[1] - s.min[1]) / (s.max[0] - s.min[0]));
      } finally {
        stacked.art.delete();
        side.art.delete();
      }
    }));

  test("logo que é um bloco cheio (fundo branco no SVG) avisa", () =>
    scoped((k) => {
      const block = k(M.CrossSection.square([40, 25], true));
      const out = buildStampArt(M, artInput({ logo: block, lines: [] }));
      out.art.delete();
      expect(out.warnings.join(" ")).toMatch(/fundo/);
    }));

  test("sem texto nem logo e sem moldura: erro", () => {
    expect(() => buildStampArt(M, artInput({ lines: [] }))).toThrow(/texto ou envie um logo/);
  });
});

describe("traço fino", () => {
  test("linha de 0,1 mm: avisa e, engrossando, passa a ter no mínimo o bico", () =>
    scoped((k) => {
      const thin = k(M.CrossSection.square([30, 0.1], true));
      const solid = k(M.CrossSection.square([10, 10], true));
      const art = k(k(thin.translate([0, 12])).add(solid));
      const warn = fixThinStrokes(M, art, false);
      expect(warn.thin).toBe(true);
      expect(warn.fixed).toBe(false);
      const fixed = fixThinStrokes(M, art, true);
      k(fixed.cs);
      expect(fixed.fixed).toBe(true);
      expect(fixThinStrokes(M, fixed.cs, false).thin).toBe(false);
      // o bloco grosso não mudou
      expect(k(fixed.cs.intersect(solid)).area()).toBeCloseTo(100, 0);
      // a linha continua no mesmo lugar
      const bb = fixed.cs.bounds();
      expect(bb.max[0] - bb.min[0]).toBeGreaterThan(29.9);
    }));

  test("desenho sem traço fino passa direto", () =>
    scoped((k) => {
      const t = fixThinStrokes(M, k(M.CrossSection.square([10, 10], true)), true);
      k(t.cs);
      expect(t).toMatchObject({ thin: false, fixed: false });
    }));
});

describe("placa de cavidade imprimível (#284)", () => {
  test("selo com texto em arco: nenhuma ilha de material na cavidade mais fina que 2 bicos", () =>
    scoped((k) => {
      const p = P({ shape: "round", w: 45, h: 45, paper: 0.6, relief: 1.2, align: "magnets" });
      const { art } = buildStampArt(M, { ...DEFAULT_ART, shape: "round", w: 45, h: 45, logo: null, lines: ["A & B"], font, frame: "seal", arcTop: "ANA & BRUNO", arcBottom: "12 · 10 · 2027" });
      k(art);
      const { bottom, T } = stampPlates(M, art, p, k);
      for (let z = T - 0.1; z > T - p.relief; z -= 0.2) {
        const thin = k(bottom.slice(z)).decompose().map(k).filter((c) => k(c.offset(-0.4, "Round")).isEmpty());
        expect(thin.map((c) => Math.round(c.area() * 100) / 100), `z = ${z.toFixed(1)}`).toEqual([]);
      }
    }));
});
