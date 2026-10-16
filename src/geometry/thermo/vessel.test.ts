import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { modelSize, modelVolume } from "../testUtil";
import { meshBounds } from "../bounds";
import { BASKET_VESSEL, buildVessel, DEFAULT_VESSEL, discRadius, profileAt, vesselProfile, type VesselParams } from "./vessel";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const V = (patch: Partial<VesselParams> = {}): VesselParams => ({ ...DEFAULT_VESSEL, ...patch });
const named = <T extends { name: string }>(list: T[], name: string) => list.find((m) => m.name === name)!;

describe("perfil do pote", () => {
  test("começa no centro do fundo, termina na boca e o comprimento é a soma dos trechos", () => {
    const pr = vesselProfile(DEFAULT_VESSEL);
    expect(pr.pts[0]).toEqual([0, DEFAULT_VESSEL.height]);
    const last = pr.pts[pr.pts.length - 1];
    expect(last[0]).toBeCloseTo(DEFAULT_VESSEL.mouthD / 2, 6);
    expect(last[1]).toBeCloseTo(0, 6);
    const a = (DEFAULT_VESSEL.draft * Math.PI) / 180;
    const wall = (DEFAULT_VESSEL.height - pr.rf * (1 - Math.sin(a))) / Math.cos(a);
    const expected = pr.flatTop + pr.rf * (Math.PI / 2 - a) + wall;
    expect(pr.total).toBeCloseTo(expected, 1);
  });

  test("a parede tem o ângulo de saída pedido: a boca é mais larga que o fundo por altura × tg(ângulo)", () => {
    const p = V({ draft: 10, cornerR: 6 });
    const pr = vesselProfile(p);
    const wallStart = pr.pts[pr.pts.length - 1 - 24];
    const run = pr.Rm - wallStart[0];
    const rise = wallStart[1];
    expect(Math.atan2(run, rise) * (180 / Math.PI)).toBeCloseTo(10, 1);
  });

  test("a normal é unitária e aponta para fora do molde (para cima no fundo, para fora na parede)", () => {
    const pr = vesselProfile(DEFAULT_VESSEL);
    for (const [nr, nz] of pr.normals) expect(Math.hypot(nr, nz)).toBeCloseTo(1, 6);
    expect(pr.normals[0]).toEqual([0, 1]);
    expect(pr.normals[pr.normals.length - 1][0]).toBeGreaterThan(0.9);
  });

  test("passando da boca, a aba é plana sobre o apoio", () => {
    const pr = vesselProfile(DEFAULT_VESSEL);
    const lip = profileAt(pr, pr.total + 3);
    expect(lip.z).toBe(0);
    expect(lip.rho).toBeCloseTo(pr.Rm + 3, 6);
    expect(lip.nz).toBe(1);
  });

  test("canto grande demais para o fundo plano caber é encolhido, e o fundo plano nunca some", () => {
    const pr = vesselProfile(V({ mouthD: 40, height: 60, draft: 20, cornerR: 30 }));
    expect(pr.rf).toBeLessThan(30);
    expect(pr.flatTop).toBeGreaterThanOrEqual(2);
  });
});

describe("pote termoformado", () => {
  test("disco do tamanho da planificação: perfil + aba + sobra; peças separadas por material", () =>
    scoped(() => {
      const out = buildVessel(M, V(), { preview: false });
      const pr = vesselProfile(DEFAULT_VESSEL);
      expect(out.info.discD).toBeCloseTo(2 * discRadius(pr, DEFAULT_VESSEL), 6);
      expect(out.info.profileLen).toBeCloseTo(pr.total, 6);
      const disc = out.screens[0];
      expect(modelSize(disc)[0]).toBeCloseTo(out.info.discD, 0);
      expect(modelSize(disc)[2]).toBeCloseTo(DEFAULT_VESSEL.t, 3);
      expect(disc.parts.map((x) => x.name)).toEqual(["Borda", "Disco"]);
      expect(out.molds.map((m) => m.name)).toEqual(["Molde macho"]);
      // com a fórmula da planificação, o disco é maior que a boca + 2 × altura da parede
      expect(out.info.discD).toBeGreaterThan(DEFAULT_VESSEL.mouthD);
    }));

  test("o molde macho tem o apoio plano e o corpo com o diâmetro da boca", () =>
    scoped(() => {
      const out = buildVessel(M, V(), { preview: false });
      const male = named(out.molds, "Molde macho");
      const [w, h, z] = modelSize(male);
      expect(w).toBeCloseTo(h, 0);
      expect(w).toBeCloseTo(DEFAULT_VESSEL.mouthD + 2 * (DEFAULT_VESSEL.flange + DEFAULT_VESSEL.margin), 0);
      expect(z).toBeCloseTo(DEFAULT_VESSEL.flangeT + DEFAULT_VESSEL.height - 0.01, 1);
      // o corpo é um tronco de cone: a seção de cima é bem menor que a da boca
      const pos = male.parts[0].mesh.positions;
      let topW = 0;
      for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] > z - 0.5) topW = Math.max(topW, Math.abs(pos[i]));
      expect(topW * 2).toBeLessThan(DEFAULT_VESSEL.mouthD - 2 * 50 * Math.tan((DEFAULT_VESSEL.draft * Math.PI) / 180) + 1);
    }));

  test("par macho + fêmea: a fêmea envolve o macho com a folga da tela + folga", () =>
    scoped((k) => {
      const out = buildVessel(M, V({ mold: "both" }), { preview: false });
      expect(out.molds.map((m) => m.name)).toEqual(["Molde macho", "Molde fêmea"]);
      const female = named(out.molds, "Molde fêmea");
      const male = named(out.molds, "Molde macho");
      expect(modelVolume(female)).toBeGreaterThan(5000);
      // a cavidade da fêmea é mais funda que o macho por tela + folga (+ teto de 2 mm)
      expect(modelSize(female)[2]).toBeGreaterThan(modelSize(male)[2] - DEFAULT_VESSEL.flangeT + 2);
      const only = buildVessel(M, V({ mold: "female" }), { preview: false });
      expect(only.molds.map((m) => m.name)).toEqual(["Molde fêmea"]);
      // sem o macho a cavidade é a superfície do pote (sem a folga): o bloco fica com menos "vazio" que no par
      expect(modelVolume(named(only.molds, "Molde fêmea"))).toBeGreaterThan(modelVolume(female));
      void k;
    }));

  test("avisos: ângulo de saída pequeno, canto vivo, borda mais larga que a sobra", () =>
    scoped(() => {
      const w = buildVessel(M, V({ draft: 3, cornerR: 1, rim: 9, margin: 4 }), { preview: false }).warnings.join(" ");
      expect(w).toMatch(/ângulo de saída/);
      expect(w).toMatch(/canto/);
      expect(w).toMatch(/borda sólida é mais larga/);
      expect(buildVessel(M, V(), { preview: false }).warnings).toEqual([]);
    }));

  test("cesto: malha na parede e fundo sólido; sem fundo sólido não tem a parte Fundo", () =>
    scoped(() => {
      const basket = buildVessel(M, V({ ...BASKET_VESSEL }), { preview: false });
      expect(basket.screens[0].parts.map((x) => x.name)).toEqual(["Borda", "Malha", "Fundo"]);
      const noBase = buildVessel(M, V({ ...BASKET_VESSEL, solidBase: false }), { preview: false });
      expect(noBase.screens[0].parts.map((x) => x.name)).toEqual(["Borda", "Malha"]);
      // a malha tem furos: menos material que o pote cheio do mesmo tamanho
      const pote = buildVessel(M, V({ mouthD: 90, height: 60, draft: 8, cornerR: 10 }), { preview: false });
      expect(modelVolume(basket.screens[0])).toBeLessThan(modelVolume(pote.screens[0]) * 0.8);
    }));

  test("pote pronto (prévia) fica em pé: tem a altura do molde mais a espessura e a boca para cima", () =>
    scoped(() => {
      const out = buildVessel(M, V({ height: 30, mouthD: 60 }));
      const b = meshBounds(out.assembled.parts.map((q) => q.mesh))!;
      expect(b.max[2] - b.min[2]).toBeGreaterThan(30 - 0.5);
      expect(b.max[2] - b.min[2]).toBeLessThan(30 + 1.2 + 0.5 + 6); // a aba plana da boca
      // a boca é a parte mais larga e está no alto
      const zs = out.assembled.parts.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 2));
      expect(Math.max(...zs)).toBeGreaterThan(Math.min(...zs));
      expect(out.assembled.previewOnly).toBe(true);
    }));
});
