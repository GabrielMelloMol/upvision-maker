import { beforeAll, describe, expect, test, vi } from "vitest";
import { estimateModels } from "../../domain/estimate";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { fixThinStrokes } from "../stampArt";
import { modelSize, modelVolume } from "../testUtil";
import { buildThermo, DEFAULT_THERMO, type ThermoParams } from "./build";
import { domeStack, inradius, insetAt, stretchOf } from "./dome";
import { buildFemaleSolid, buildMoldSolid, DEFAULT_MOLD, moldGap } from "./mold";
import { DEFAULT_CAP } from "./thread";
import { clipRegion, DEFAULT_SCREEN, earOf, meshHoles, screenRegions } from "./screen";
import { asymmetry, fitSilhouette, presetSilhouette, SHAPE_LABELS, symmetrize, type ThermoShape } from "./shapes";

// o domo e a prévia pesam: com a máquina ocupada (vários agentes e E2E ao mesmo tempo) o padrão de 60 s não chega
vi.setConfig({ testTimeout: 180_000 });

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

  test("a orelha não invade o miolo: a borda (com orelha) não sobrepõe a malha, nem no coração", () =>
    scoped((k) => {
      const heart = k(presetSilhouette(M, "heart", 70));
      const ear = earOf(M, heart, DEFAULT_SCREEN, k);
      const reg = screenRegions(M, heart, null, DEFAULT_SCREEN, k, ear);
      k(reg.border); k(reg.mesh); k(reg.design);
      expect(k(reg.border.intersect(reg.mesh)).area()).toBeLessThan(1e-6);
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
      expect(k(s.intersect(h)).area()).toBeGreaterThan(s.area() * 0.35);
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
  const named = (list: Model[], name: string) => list.find((m) => m.name === name)!;
  const quick = (m: ManifoldToplevel, a: Parameters<typeof buildThermo>[1], b: Parameters<typeof buildThermo>[2], c: ThermoParams) => buildThermo(m, a, b, c, { preview: false });

  test("telas, bases, fecho e moldes em grupos por material; cores separadas; só a prévia fica fora do arquivo", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), dot(k, 10), P({ baseArt: true, colors: { sheet: "#112233", border: "#223344", design: "#334455", mold: "#445566", clip: "#556677", base: "#667788" } }));
      expect(out.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2", "Base 1", "Base 2"]);
      expect(out.closure.map((m) => m.name)).toEqual(["Clipe"]);
      expect(out.molds.map((m) => m.name)).toEqual(["Molde macho", "Molde fêmea"]);
      for (const n of ["Tela 1", "Tela 2"]) expect(named(out.screens, n).parts.map((x) => x.name)).toEqual(["Borda", "Malha", "Design"]);
      expect(new Set(named(out.screens, "Tela 1").parts.map((x) => x.color)).size).toBe(3);
      expect(named(out.screens, "Base 1").parts.map((x) => x.name)).toEqual(["Base", "Arte"]);
      for (const m of [...out.screens, ...out.closure, ...out.molds]) expect(m.previewOnly, m.name).toBeFalsy();
      expect(out.assembled.previewOnly).toBe(true);
      expect(out.shell.previewOnly).toBe(true);
      // telas e bases planas na mesa, com a espessura pedida
      for (const n of ["Tela 1", "Tela 2"]) expect(modelSize(named(out.screens, n))[2]).toBeCloseTo(DEFAULT_SCREEN.t, 3);
      for (const n of ["Base 1", "Base 2"]) expect(modelSize(named(out.screens, n))[2]).toBeCloseTo(DEFAULT_THERMO.baseT, 3);
      expect(modelSize(out.closure[0])[2]).toBeCloseTo(DEFAULT_SCREEN.clipT, 3);
      // a caixa montada tem duas cascas e duas bases: altura ≈ 2 × (domo + tela + base)
      expect(modelSize(out.assembled)[2]).toBeCloseTo(2 * (DEFAULT_THERMO.domeH + DEFAULT_SCREEN.t + DEFAULT_THERMO.baseT), 0);
      expect(out.info.stretch).toBeGreaterThan(1);
      // o domo padrão não passa do limite de esticamento em nenhum formato pronto
      for (const shape of SHAPES) expect(quick(M, k(presetSilhouette(M, shape, 70)), null, P()).warnings.join(" "), shape).not.toMatch(/estica/);
    }));

  test("o clipe vai nas bases quando elas existem (a orelha sai da placa, não da tela) e na tela quando não há base", () =>
    scoped((k) => {
      const withBase = quick(M, sil(k, "circle"), null, P());
      expect(modelSize(named(withBase.screens, "Tela 1"))[1]).toBeCloseTo(70, 0);
      expect(modelSize(named(withBase.screens, "Base 1"))[1]).toBeGreaterThan(75);
      const none = quick(M, sil(k, "circle"), null, P({ bases: "none" }));
      expect(none.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2"]);
      expect(modelSize(named(none.screens, "Tela 1"))[1]).toBeGreaterThan(75);
    }));

  test("bases: nenhuma, uma só (a outra metade fica com a orelha) ou as duas", () =>
    scoped((k) => {
      const one = buildThermo(M, sil(k, "circle"), null, P({ bases: "one" }));
      expect(one.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2", "Base 1"]);
      expect(modelSize(named(one.screens, "Tela 1"))[1]).toBeCloseTo(70, 0);
      expect(modelSize(named(one.screens, "Tela 2"))[1]).toBeGreaterThan(75);
      expect(one.info.bases).toBe("one");
      // a caixa montada com uma base só: altura = domo + tela + base + domo + tela
      expect(modelSize(one.assembled)[2]).toBeCloseTo(2 * (DEFAULT_THERMO.domeH + DEFAULT_SCREEN.t) + DEFAULT_THERMO.baseT, 0);
    }));

  test("o desenho também vai na base (outra cor, nivelado) e some quando se desliga", () =>
    scoped((k) => {
      const on = quick(M, sil(k), dot(k, 10), P({ baseArt: true }));
      const off = quick(M, sil(k), dot(k, 10), P({ baseArt: false }));
      expect(named(on.screens, "Base 1").parts.map((x) => x.name)).toEqual(["Base", "Arte"]);
      expect(named(off.screens, "Base 1").parts.map((x) => x.name)).toEqual(["Base"]);
      const art = modelVolume({ name: "", parts: named(on.screens, "Base 1").parts.filter((x) => x.name === "Arte") });
      expect(art).toBeGreaterThan(Math.PI * 9 ** 2 * DEFAULT_THERMO.baseT * 0.8);
    }));

  test("tampa rosqueada: pino nas duas bases, tampa com furo da fita e as bases ligadas à força", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k), null, P({ bases: "none", screen: { ...DEFAULT_SCREEN, closure: "cap" } }));
      expect(out.warnings.join(" ")).toMatch(/tampa rosqueada precisa das bases/);
      expect(out.info.bases).toBe("both");
      expect(out.closure.map((m) => m.name)).toEqual(["Tampa"]);
      for (const n of ["Base 1", "Base 2"]) expect(named(out.screens, n).parts.map((x) => x.name)).toContain("Pino");
      // o meio-pino sobe até o raio do pino acima da face da mesa
      expect(modelSize(named(out.screens, "Base 1"))[2]).toBeCloseTo(DEFAULT_CAP.thread.major, 0);
      // o pino sai além do ponto mais alto do coração e a tampa cobre a ponta dele
      const ys = named(out.screens, "Base 1").parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 1));
      const heartH = sil(k).bounds().max[1] - sil(k).bounds().min[1];
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(heartH + DEFAULT_CAP.thread.length * 0.9);
      expect(out.assembled.parts.map((x) => x.name)).toContain("Tampa");
      expect(buildThermo(M, sil(k), null, P({ screen: { ...DEFAULT_SCREEN, closure: "cap" } })).warnings.join(" ")).not.toMatch(/tampa rosqueada precisa/);
    }));

  test("tampa e pino: o pino de uma base e o da outra formam um cilindro inteiro na emenda", () =>
    scoped((k) => {
      const out = buildThermo(M, sil(k, "circle"), null, P({ screen: { ...DEFAULT_SCREEN, closure: "cap" } }));
      const pin = out.assembled.parts.find((x) => x.name === "Pino")!;
      const zs = [...pin.mesh.positions].filter((_, i) => i % 3 === 2);
      expect(Math.max(...zs)).toBeCloseTo(DEFAULT_CAP.thread.major, 1);
      expect(Math.min(...zs)).toBeCloseTo(-DEFAULT_CAP.thread.major, 1);
    }));

  test("molde padrão (coração de 70 mm): o macho pesa até 120 g e menos que o maciço; macho e fêmea são peças separadas", () =>
    scoped((k) => {
      const out = quick(M, sil(k), null, P());
      const est = estimateModels([named(out.molds, "Molde macho")], { layerHeight: 0.24, walls: 3, infill: 8, support: false })!;
      expect(est.grams).toBeLessThanOrEqual(120);
      expect(est.grams).toBeGreaterThan(5);
      const solid = quick(M, sil(k), null, P({ mold: { ...DEFAULT_MOLD, hollow: false } }));
      expect(modelVolume(named(out.molds, "Molde macho"))).toBeLessThan(modelVolume(named(solid.molds, "Molde macho")));
      expect(modelVolume(named(out.molds, "Molde fêmea"))).toBeGreaterThan(1000);
    }));

  test("tela de PLA da caixinha gasta menos de 20 g", () =>
    scoped((k) => {
      const out = quick(M, sil(k), dot(k, 10), P());
      const est = estimateModels(out.screens.filter((m) => m.name.startsWith("Tela")), { layerHeight: 0.2, walls: 2, infill: 100, support: false })!;
      expect(est.grams / 2).toBeLessThan(20);
    }));

  test("compensar o esticamento encolhe o desenho; sem compensar, não", () =>
    scoped((k) => {
      const d = dot(k, 12);
      const on = quick(M, sil(k), d, P({ compensate: true }));
      const off = quick(M, sil(k), d, P({ compensate: false }));
      expect(on.info.designScale).toBeLessThan(1);
      expect(on.info.designScale).toBeGreaterThanOrEqual(0.6);
      expect(off.info.designScale).toBe(1);
      const area = (o: typeof on) => modelVolume({ name: "", parts: named(o.screens, "Tela 1").parts.filter((x) => x.name === "Design") });
      expect(area(on)).toBeLessThan(area(off));
    }));

  test("o domo nasce no limite interno da borda sólida e o apoio vai além da silhueta", () =>
    scoped((k) => {
      const out = quick(M, k(presetSilhouette(M, "circle", 70)), null, P());
      const mb = named(out.molds, "Molde macho").parts[0].mesh.positions;
      const widthAt = (zMin: number) => {
        const xs: number[] = [];
        for (let i = 0; i < mb.length; i += 3) if (mb[i + 2] > zMin) xs.push(mb[i]);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(widthAt(DEFAULT_MOLD.flangeT + DEFAULT_SCREEN.t + 0.5)).toBeCloseTo(70 - 2 * DEFAULT_SCREEN.border, 0);
      expect(widthAt(-1)).toBeCloseTo(70 + 2 * DEFAULT_MOLD.flange, 0);
    }));

  test("bola de Natal: o pescoço da alça não vira domo (fica plano, onde a orelha sai)", () =>
    scoped((k) => {
      const out = quick(M, k(presetSilhouette(M, "ball", 70)), null, P());
      const m = named(out.molds, "Molde macho").parts[0].mesh.positions;
      let hi = -1e9, lo = 1e9;
      for (let i = 0; i < m.length; i += 3) {
        if (m[i + 2] <= DEFAULT_MOLD.flangeT + DEFAULT_SCREEN.t + 0.5) continue;
        hi = Math.max(hi, m[i + 1]);
        lo = Math.min(lo, m[i + 1]);
      }
      // o domo acompanha o círculo (raio 35 − borda 3 = 32, ou seja, 64 de ponta a ponta), não o pescoço que sobe até 50
      expect(hi - lo).toBeLessThan(66);
    }));

  test("traço fino no desenho: avisa e engrossa (ou só avisa, se pedir)", () =>
    scoped((k) => {
      const hair = k(M.CrossSection.square([30, 0.12], true));
      const on = quick(M, sil(k), hair, P({ compensate: false, thickenDesign: true }));
      expect(on.warnings.join(" ")).toMatch(/engrossei/);
      const off = quick(M, sil(k), hair, P({ compensate: false, thickenDesign: false }));
      expect(off.warnings.join(" ")).toMatch(/mais finos que o bico/);
      const vol = (o: typeof on) => modelVolume({ name: "", parts: named(o.screens, "Tela 1").parts.filter((x) => x.name === "Design") });
      expect(vol(on)).toBeGreaterThan(vol(off) * 2);
    }));

  test("domo alto demais avisa do esticamento", () =>
    scoped((k) => {
      const out = quick(M, sil(k, "circle"), null, P({ domeH: 40 }));
      expect(out.warnings.join(" ")).toMatch(/estica/);
      expect(quick(M, sil(k, "circle"), null, P({ domeH: 8 })).warnings.join(" ")).not.toMatch(/estica/);
    }));

  test("faixa externa (aro): um modelo em pé, mais alto que a tela, em volta da silhueta, junto das telas e bases", () =>
    scoped((k) => {
      const out = quick(M, sil(k, "circle"), null, P({ screen: { ...DEFAULT_SCREEN, closure: "ring" } }));
      const ring = named(out.screens, "Faixa externa");
      expect(modelSize(ring)[2]).toBeCloseTo(DEFAULT_SCREEN.ringH, 3);
      expect(modelSize(ring)[0]).toBeCloseTo(70 + 2 * (DEFAULT_SCREEN.ringGap + DEFAULT_SCREEN.ringT), 0);
      expect(out.closure).toHaveLength(0);
    }));

  test("sem fecho: só as telas e as bases, sem orelha", () =>
    scoped((k) => {
      const out = quick(M, sil(k, "circle"), null, P({ screen: { ...DEFAULT_SCREEN, closure: "none" } }));
      expect(out.screens.map((m) => m.name)).toEqual(["Tela 1", "Tela 2", "Base 1", "Base 2"]);
      expect(modelSize(named(out.screens, "Base 1"))[1]).toBeCloseTo(70, 0);
      expect(out.closure).toHaveLength(0);
    }));

  test("desenho só numa metade: a outra fica toda em malha", () =>
    scoped((k) => {
      const out = quick(M, sil(k), dot(k, 10), P({ designOnBoth: false }));
      expect(named(out.screens, "Tela 1").parts.map((x) => x.name)).toContain("Design");
      expect(named(out.screens, "Tela 2").parts.map((x) => x.name)).not.toContain("Design");
      expect(named(out.screens, "Base 2").parts.map((x) => x.name)).not.toContain("Arte");
    }));

  test("desenho maior que a tela é cortado na borda e avisa", () =>
    scoped((k) => {
      const out = quick(M, sil(k, "circle"), dot(k, 40), P({ compensate: false }));
      expect(out.warnings.join(" ")).toMatch(/passa da área/);
    }));

  test("cada formato pronto gera caixinha completa sem erro", () => {
    for (const shape of SHAPES) {
      scoped((k) => {
        const out = quick(M, k(presetSilhouette(M, shape, 60)), null, P({ domeH: 10 }));
        expect(out.screens.length).toBe(4);
        expect(out.molds.length).toBe(2);
        expect(modelVolume(named(out.molds, "Molde macho"))).toBeGreaterThan(1000);
      });
    }
  });
});

describe("molde fêmea", () => {
  const circle = (k: K) => k(presetSilhouette(M, "circle", 70));
  const parts = (k: K, patch: Partial<typeof DEFAULT_MOLD> = {}, t = 1, H = 10) => {
    const s = circle(k);
    const inner = k(s.offset(-3, "Round"));
    const g = { L: inradius(inner), H, q: 2.2 };
    const m = { ...DEFAULT_MOLD, ...patch };
    const male = buildMoldSolid(M, inner, g, m, k, s, t);
    const female = buildFemaleSolid(M, inner, g, m, k, s, t, true);
    return { male, female, g, m, t };
  };
  const column = (k: K, z0: number, z1: number) => k(k(M.Manifold.cylinder(z1 - z0, 0.4, 0.4, 12)).translate([0, 0, z0]));

  test("a fêmea não toca o macho: não há material em comum", () =>
    scoped((k) => {
      const { male, female } = parts(k);
      expect(k(male.intersect(female)).volume()).toBeLessThan(1);
    }));

  test("a folga no topo é a espessura da tela + a folga pedida", () =>
    scoped((k) => {
      for (const clearance of [0.2, 0.3, 0.4]) {
        const { male, female, m, t, g } = parts(k, { clearance });
        const e = moldGap(t, m);
        const maleTop = k(column(k, 0, 40).intersect(male)).boundingBox().max[2];
        // do apoio da fêmea até logo abaixo do teto: o que não é fêmea é a cavidade
        const probe = column(k, m.flangeT + t + 0.5, m.flangeT + g.H + e + m.top - 0.01);
        const cavityTop = k(probe.subtract(female)).boundingBox().max[2];
        // o teto da cavidade fecha no degrau seguinte: nunca menos que a folga, no máximo um degrau (0,4 mm) a mais
        expect(cavityTop - maleTop).toBeGreaterThanOrEqual(e - 1e-6);
        expect(cavityTop - maleTop).toBeLessThan(e + 0.45);
      }
    }));

  test("a folga também vale nas laterais: a cavidade é mais larga que o domo em 2 × (tela + folga)", () =>
    scoped((k) => {
      const { male, female, m, t, g } = parts(k);
      const zMid = m.flangeT + g.H * 0.2;
      const row = k(k(M.Manifold.cube([76, 0.4, 0.2], true)).translate([0, 0, zMid]));
      const widthOf = (s: ReturnType<typeof parts>["male"]) => {
        const b = s.boundingBox();
        return b.max[0] - b.min[0];
      };
      const maleW = widthOf(k(row.intersect(male)));
      const cavityW = widthOf(k(row.subtract(female)));
      expect(maleW).toBeGreaterThan(40);
      expect(cavityW - maleW).toBeCloseTo(2 * moldGap(t, m), 1);
    }));

  test("na posição de impressão a abertura da cavidade fica para cima, na face de cima do bloco", () =>
    scoped((k) => {
      const s = circle(k);
      const inner = k(s.offset(-3, "Round"));
      const g = { L: inradius(inner), H: 10, q: 2.2 };
      const female = buildFemaleSolid(M, inner, g, DEFAULT_MOLD, k, s, 1);
      const b = female.boundingBox();
      expect(b.min[2]).toBeCloseTo(0, 6);
      // o fundo da cavidade tem o teto de `top` mm; na boca (z máximo) o furo é o mais largo
      const slice = (z: number) => k(female.intersect(k(k(M.Manifold.cube([300, 300, 0.05], true)).translate([0, 0, z]))));
      expect(slice(b.max[2] - 0.05).volume()).toBeLessThan(slice(0.2).volume());
    }));

  test("a parede de centralização cerca a tela e tem a altura dela", () =>
    scoped((k) => {
      const { male, m } = parts(k);
      const ring = k(male.intersect(k(k(M.Manifold.cube([300, 300, 0.2], true)).translate([0, 0, m.flangeT + 0.5]))));
      // à altura da tela o apoio tem a cavidade da tela dentro da parede: a seção ocupada é um anel em volta do contorno + o domo
      const b = ring.boundingBox();
      expect(b.max[0] - b.min[0]).toBeCloseTo(70 + 2 * (0.3 + m.centerWall), 0);
      const none = parts(k, { centerWall: 0 });
      const b0 = k(none.male.intersect(k(k(M.Manifold.cube([300, 300, 0.2], true)).translate([0, 0, none.m.flangeT + 0.5])))).boundingBox();
      expect(b0.max[0] - b0.min[0]).toBeLessThan(70 - 4);
    }));
});
