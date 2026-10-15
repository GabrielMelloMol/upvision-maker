import { beforeAll, describe, expect, test } from "vitest";
import { estimateModels } from "../../domain/estimate";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { fixThinStrokes } from "../stampArt";
import { modelSize, modelVolume } from "../testUtil";
import { buildThermo, DEFAULT_THERMO, type ThermoParams } from "./build";
import { domeStack, inradius, insetAt, stretchOf } from "./dome";
import { buildMoldSolid, DEFAULT_MOLD } from "./mold";
import { clipRegion, DEFAULT_SCREEN, earOf, meshHoles, screenRegions } from "./screen";
import { asymmetry, fitSilhouette, presetSilhouette, SHAPE_LABELS, symmetrize, type ThermoShape } from "./shapes";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

type K = <D extends { delete(): void }>(o: D) => D;
const SHAPES = SHAPE_LABELS.map(([s]) => s);
const dot = (k: K, r = 8, x = 0, y = 0) => k(k(M.CrossSection.circle(r, 48)).translate([x, y]));
const P = (patch: Partial<ThermoParams> = {}): ThermoParams => ({ ...DEFAULT_THERMO, ...patch });

describe("silhueta", () => {
  for (const shape of SHAPES) {
    test(`${shape}: simétrica pelo eixo, centrada e na largura pedida`, () =>
      scoped((k) => {
        const sil = k(presetSilhouette(M, shape, 70));
        const b = sil.bounds();
        expect(b.max[0] - b.min[0]).toBeCloseTo(70, 3);
        expect(Math.abs(b.max[0] + b.min[0])).toBeLessThan(1e-6);
        expect(Math.abs(b.max[1] + b.min[1])).toBeLessThan(1e-6);
        expect(asymmetry(sil)).toBeLessThan(0.004);
      }));
  }

  test("forçar a simetria espelha a metade escolhida e some o aviso", () =>
    scoped((k) => {
      // um "L" deitado: só a metade esquerda é larga
      const sil = k(fitSilhouette(k(new M.CrossSection([[[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]]], "NonZero")), 60));
      expect(asymmetry(sil)).toBeGreaterThan(0.1);
      const left = k(symmetrize(M, sil, "left"));
      const right = k(symmetrize(M, sil, "right"));
      for (const s of [left, right]) {
        expect(asymmetry(s)).toBeLessThan(1e-3);
        expect(s.area()).toBeLessThanOrEqual(2 * sil.area());
      }
      // metades diferentes dão silhuetas diferentes, ambas simétricas
      expect(Math.abs(left.area() - right.area())).toBeGreaterThan(0.01);
      expect(k(symmetrize(M, sil, "keep")).area()).toBeCloseTo(sil.area(), 6);
    }));
});

describe("domo e molde", () => {
  test("perfil sobe da borda (0) ao topo (L) e o domo tem a altura pedida", () =>
    scoped((k) => {
      const sil = k(presetSilhouette(M, "circle", 60));
      const L = inradius(sil);
      expect(L).toBeCloseTo(30, 0);
      const g = { L, H: 15, q: 2.2 };
      expect(insetAt(0, g)).toBe(0);
      expect(insetAt(15, g)).toBeCloseTo(L, 6);
      let last = -1;
      for (let z = 0; z <= 15; z += 1) {
        expect(insetAt(z, g)).toBeGreaterThanOrEqual(last);
        last = insetAt(z, g);
      }
      const dome = domeStack(M, sil, g, 0, k);
      const bb = dome.boundingBox();
      expect(bb.max[2]).toBeCloseTo(15, 0);
      expect(bb.max[0] - bb.min[0]).toBeCloseTo(60, 1);
    }));

  test("esticamento: ≥ 1, cresce com a altura e a ampliação cai de S no topo a 1 na borda", () => {
    const low = stretchOf({ L: 30, H: 6, q: 2.2 });
    const high = stretchOf({ L: 30, H: 24, q: 2.2 });
    expect(low.S).toBeGreaterThan(1);
    expect(high.S).toBeGreaterThan(low.S);
    expect(high.magnification(0)).toBeCloseTo(high.S, 6);
    expect(high.magnification(30)).toBeCloseTo(1, 2);
    const mid = high.magnification(15);
    expect(mid).toBeLessThan(high.S);
    expect(mid).toBeGreaterThan(1);
  });

  test("molde oco com nervuras é uma peça só e pesa bem menos que o maciço", () =>
    scoped((k) => {
      const sil = k(presetSilhouette(M, "heart", 70));
      const g = { L: inradius(sil), H: 14, q: 2.2 };
      const hollow = buildMoldSolid(M, sil, g, DEFAULT_MOLD, k);
      const solid = buildMoldSolid(M, sil, g, { ...DEFAULT_MOLD, hollow: false }, k);
      // o oco são células fechadas (casca de volume negativo): só um corpo de verdade
      const bodies = hollow.decompose().map(k).filter((c) => c.volume() > 0);
      expect(bodies.length).toBe(1);
      expect(hollow.volume()).toBeLessThan(solid.volume() * 0.6);
      // a casca ainda tem a base e o topo do domo
      const hb = hollow.boundingBox();
      expect(hb.max[2]).toBeCloseTo(DEFAULT_MOLD.flangeT + 14, 0);
      expect(hb.min[2]).toBeCloseTo(0, 6);
    }));
});

describe("tela em malha", () => {
  const sil = (k: K) => k(presetSilhouette(M, "circle", 60));

  for (const style of ["honeycomb", "diamond"] as const) {
    test(`${style}: fios de pelo menos a espessura pedida, furos inteiros e tudo ligado à borda`, () =>
      scoped((k) => {
        const s = sil(k);
        const p = { ...DEFAULT_SCREEN, mesh: style };
        const reg = screenRegions(M, s, null, p, k);
        k(reg.border); k(reg.mesh); k(reg.design);
        const whole = k(M.CrossSection.union([reg.border, reg.mesh]));
        // um corpo só: nada de fio solto
        expect(whole.decompose().length).toBe(1);
        // fio: nada mais fino que o bico (a abertura de 0,4 mm não come mais que 3% da malha)
        expect(fixThinStrokes(M, reg.mesh, false).thin).toBe(false);
        // furos: nenhum fragmento menor que o bico
        const holes = k(k(s.offset(-p.border, "Round")).subtract(reg.mesh));
        const opened = k(k(holes.offset(-0.19, "Round")).offset(0.19, "Round"));
        expect(opened.area()).toBeGreaterThan(holes.area() * 0.97);
        expect(holes.decompose().length).toBeGreaterThan(100);
        // abertura: área do furo bate com o desenho do favo (hexágono) / do losango (quadrado)
        const one = holes.decompose().map(k).map((h) => h.area()).sort((a, b) => b - a)[Math.floor(holes.decompose().length / 2)];
        const expected = style === "honeycomb" ? (Math.sqrt(3) / 2) * p.aperture ** 2 : p.aperture ** 2;
        expect(one).toBeCloseTo(expected, 0);
      }));
  }

  test("borda, malha e desenho não se sobrepõem e juntos cobrem a silhueta (menos os furos)", () =>
    scoped((k) => {
      const s = sil(k);
      const design = dot(k, 10);
      const reg = screenRegions(M, s, design, DEFAULT_SCREEN, k);
      k(reg.border); k(reg.mesh); k(reg.design);
      expect(k(reg.border.intersect(reg.mesh)).area()).toBeLessThan(1e-6);
      expect(k(reg.design.intersect(reg.mesh)).area()).toBeLessThan(1e-6);
      expect(k(reg.design.intersect(reg.border)).area()).toBeLessThan(1e-6);
      expect(reg.design.area()).toBeCloseTo(design.area(), 1);
      const holes = k(s.subtract(k(M.CrossSection.union([reg.border, reg.mesh, reg.design]))));
      expect(holes.area()).toBeGreaterThan(0);
      expect(holes.area()).toBeLessThan(s.area() * 0.6);
      // desenho e malha encostam (o desenho está no mesmo plano, sem vão)
      expect(k(M.CrossSection.union([reg.mesh, reg.design])).decompose().length).toBeLessThanOrEqual(2);
    }));

  test("furos da malha ficam a um fio do desenho e da borda", () =>
    scoped((k) => {
      const s = sil(k);
      const design = dot(k, 10);
      const reg = screenRegions(M, s, design, DEFAULT_SCREEN, k);
      k(reg.border); k(reg.mesh); k(reg.design);
      const holes = k(k(s.offset(-DEFAULT_SCREEN.border, "Round")).subtract(k(M.CrossSection.union([reg.mesh, reg.design]))));
      const near = k(k(design.offset(DEFAULT_SCREEN.wire - 0.05, "Round")).intersect(holes));
      expect(near.area()).toBeLessThan(1e-3);
    }));

  test("meshHoles cobre a caixa inteira", () =>
    scoped((k) => {
      const s = sil(k);
      const h = meshHoles(M, s.bounds(), DEFAULT_SCREEN, k);
      expect(k(s.subtract(h)).area()).toBeLessThan(s.area());
      expect(k(s.intersect(h)).area()).toBeGreaterThan(s.area() * 0.5);
    }));
});

describe("fecho", () => {
  for (const shape of ["heart", "star", "ball", "circle"] as ThermoShape[]) {
    for (const side of ["top", "bottom"] as const) {
      test(`${shape} (${side}): orelha fora da silhueta, no eixo, com o furo fora do formato`, () =>
        scoped((k) => {
          const s = k(presetSilhouette(M, shape, 70));
          const p = { ...DEFAULT_SCREEN, side };
          const ear = earOf(M, s, p, k);
          const sb = s.bounds(), eb = ear.bounds();
          expect(Math.abs(eb.min[0] + eb.max[0])).toBeLessThan(1e-6);
          if (side === "top") expect(eb.max[1]).toBeGreaterThan(sb.max[1]);
          else expect(eb.min[1]).toBeLessThan(sb.min[1]);
          // o furo (a parte que a orelha não tem) está inteiro fora da silhueta
          const earHoleArea = Math.PI * (p.hole / 2) ** 2;
          const solidEar = k(k(ear.offset(5, "Round")).offset(-5, "Round"));
          const holeCs = k(solidEar.subtract(ear));
          expect(holeCs.area()).toBeGreaterThan(earHoleArea * 0.9);
          expect(k(holeCs.intersect(s)).area()).toBeLessThan(1e-6);
        }));
    }
  }

  test("clipe: uma peça aberta; as pontas passam pelos furos e as duas orelhas cabem dentro", () =>
    scoped((k) => {
      const p = DEFAULT_SCREEN;
      const clip = clipRegion(M, p, k);
      expect(clip.decompose().length).toBe(1);
      const b = clip.bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(p.clipLen, 3);
      // ponta (largura × espessura) passa pelo furo com folga; a diagonal é o pior caso
      expect(Math.hypot(p.clipWire, p.clipT) + 0.6).toBeLessThanOrEqual(p.hole);
      // as duas telas empilhadas (2 × espessura) e a largura da orelha cabem no vão do clipe
      const inner = p.clipW - 2 * p.clipWire;
      expect(DEFAULT_THERMO.screen.t * 2 + 0.4).toBeLessThanOrEqual(inner);
      expect(p.earW).toBeLessThanOrEqual(p.clipLen - 2 * p.clipWire);
      // a abertura do "C" é menor que o vão (não escapa sozinho) e maior que a ponta
      expect(p.clipGap).toBeLessThan(p.clipLen - 2 * p.clipWire);
      expect(p.clipGap).toBeGreaterThan(p.clipWire);
    }));
});

describe("caixinha completa", () => {
  const sil = (k: K, shape: ThermoShape = "heart") => k(presetSilhouette(M, shape, 70));

  test("duas telas, clipe, molde e prévia; cores separadas; só a prévia fica fora do arquivo", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), dot(k, 10), P({ colors: { sheet: "#112233", border: "#223344", design: "#334455", mold: "#445566", clip: "#556677" } }));
      expect(out.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2", "Clipe"]);
      for (const m of out.screens.slice(0, 2)) expect(m.parts.map((x) => x.name)).toEqual(["Borda", "Malha", "Design"]);
      expect(new Set(out.screens[0].parts.map((x) => x.color)).size).toBe(3);
      expect(out.mold.previewOnly).toBeFalsy();
      expect(out.assembled.previewOnly).toBe(true);
      // telas planas na mesa, com a espessura pedida
      for (const m of out.screens.slice(0, 2)) expect(modelSize(m)[2]).toBeCloseTo(DEFAULT_SCREEN.t, 3);
      expect(modelSize(out.screens[2])[2]).toBeCloseTo(DEFAULT_SCREEN.clipT, 3);
      // a caixa montada tem duas cascas: altura ≈ 2 × (domo + tela)
      expect(modelSize(out.assembled)[2]).toBeCloseTo(2 * (DEFAULT_THERMO.domeH + DEFAULT_SCREEN.t), 0);
      expect(out.info.stretch).toBeGreaterThan(1);
      // o domo padrão não passa do limite de esticamento em nenhum formato pronto
      for (const shape of SHAPES) expect(buildThermo(M, k(presetSilhouette(M, shape, 70)), null, P()).warnings.join(" "), shape).not.toMatch(/estica/);
    }));

  test("molde padrão (coração de 70 mm) pesa até 120 g e menos que o maciço; o 3MF do molde é uma peça", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), null, P());
      const est = estimateModels([out.mold], { layerHeight: 0.2, walls: 3, infill: 8, support: false })!;
      expect(est.grams).toBeLessThanOrEqual(120);
      expect(est.grams).toBeGreaterThan(5);
      const solid = buildThermo(M, sil(k), null, P({ mold: { ...DEFAULT_MOLD, hollow: false } }));
      expect(modelVolume(out.mold)).toBeLessThan(modelVolume(solid.mold));
    }));

  test("tela de PLA da caixinha gasta menos de 20 g", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), dot(k, 10), P());
      const est = estimateModels(out.screens.slice(0, 2), { layerHeight: 0.2, walls: 2, infill: 100, support: false })!;
      expect(est.grams / 2).toBeLessThan(20);
    }));

  test("compensar o esticamento encolhe o desenho; sem compensar, não", () =>
    scoped((k) => {
      const d = dot(k, 12);
      const on = buildThermo(M, sil(k), d, P({ compensate: true }));
      const off = buildThermo(M, sil(k), d, P({ compensate: false }));
      expect(on.info.designScale).toBeLessThan(1);
      expect(on.info.designScale).toBeGreaterThanOrEqual(0.6);
      expect(off.info.designScale).toBe(1);
      const area = (m: (typeof on.screens)[number]) => modelVolume({ ...m, parts: m.parts.filter((x) => x.name === "Design") });
      expect(area(on.screens[0])).toBeLessThan(area(off.screens[0]));
    }));

  test("o domo nasce no limite interno da borda sólida e o apoio vai além da silhueta", () =>
    scoped((k) => {
      const out = buildThermo(M, k(presetSilhouette(M, "circle", 70)), null, P());
      const mb = out.mold.parts[0].mesh.positions;
      const widthAt = (zMin: number) => {
        const xs: number[] = [];
        for (let i = 0; i < mb.length; i += 3) if (mb[i + 2] > zMin) xs.push(mb[i]);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(widthAt(DEFAULT_MOLD.flangeT + 0.5)).toBeCloseTo(70 - 2 * DEFAULT_SCREEN.border, 0);
      expect(widthAt(-1)).toBeCloseTo(70 + 2 * DEFAULT_MOLD.flange, 0);
    }));

  test("traço fino no desenho: avisa e engrossa (ou só avisa, se pedir)", () =>
    scoped((k) => {
      const hair = k(M.CrossSection.square([30, 0.12], true));
      const on = buildThermo(M, sil(k), hair, P({ compensate: false, thickenDesign: true }));
      expect(on.warnings.join(" ")).toMatch(/engrossei/);
      const off = buildThermo(M, sil(k), hair, P({ compensate: false, thickenDesign: false }));
      expect(off.warnings.join(" ")).toMatch(/mais finos que o bico/);
      const vol = (o: typeof on) => modelVolume({ ...o.screens[0], parts: o.screens[0].parts.filter((x) => x.name === "Design") });
      expect(vol(on)).toBeGreaterThan(vol(off) * 2);
    }));

  test("domo alto demais avisa do esticamento", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k, "circle"), null, P({ domeH: 40 }));
      expect(out.warnings.join(" ")).toMatch(/estica/);
      expect(buildThermo(M, sil(k, "circle"), null, P({ domeH: 8 })).warnings.join(" ")).not.toMatch(/estica/);
    }));

  test("faixa externa: um modelo em pé, mais alto que a tela, em volta da silhueta", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k, "circle"), null, P({ screen: { ...DEFAULT_SCREEN, closure: "ring" } }));
      const ring = out.screens.find((m) => m.name === "Faixa externa")!;
      expect(modelSize(ring)[2]).toBeCloseTo(DEFAULT_SCREEN.ringH, 3);
      expect(modelSize(ring)[0]).toBeCloseTo(70 + 2 * (DEFAULT_SCREEN.ringGap + DEFAULT_SCREEN.ringT), 0);
      expect(out.screens.find((m) => m.name === "Clipe")).toBeUndefined();
    }));

  test("sem fecho: só as duas telas, sem orelha", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k, "circle"), null, P({ screen: { ...DEFAULT_SCREEN, closure: "none" } }));
      expect(out.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2"]);
      expect(modelSize(out.screens[0])[1]).toBeCloseTo(70, 0);
    }));

  test("desenho só numa metade: a outra fica toda em malha", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), dot(k, 10), P({ designOnBoth: false }));
      expect(out.screens[0].parts.map((x) => x.name)).toContain("Design");
      expect(out.screens[1].parts.map((x) => x.name)).not.toContain("Design");
    }));

  test("desenho maior que a tela é cortado na borda e avisa", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k, "circle"), dot(k, 40), P({ compensate: false }));
      expect(out.warnings.join(" ")).toMatch(/passa da área/);
    }));

  test("cada formato pronto gera caixinha completa sem erro", () => {
    for (const shape of SHAPES) {
      scoped((k) => {
        const out = buildThermo(M, k(presetSilhouette(M, shape, 60)), null, P({ domeH: 10 }));
        expect(out.screens.length).toBe(3);
        expect(modelVolume(out.mold)).toBeGreaterThan(1000);
      });
    }
  });
});

