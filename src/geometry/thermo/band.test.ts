import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { modelSize, modelVolume } from "../testUtil";
import { buildBand, DEFAULT_BAND, stripLength, type BandParams } from "./band";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const B = (patch: Partial<BandParams> = {}): BandParams => ({ ...DEFAULT_BAND, ...patch });

describe("pulseira termoformada", () => {
  test("tira plana: comprimento = pulso − abertura, largura e espessura pedidas", () =>
    scoped(() => {
      const out = buildBand(M, B(), null, { preview: false });
      const [w, h, z] = modelSize(out.strip[0]);
      expect(w).toBeCloseTo(stripLength(DEFAULT_BAND), 0);
      expect(stripLength(DEFAULT_BAND)).toBe(175);
      expect(h).toBeCloseTo(DEFAULT_BAND.width, 0);
      expect(z).toBeCloseTo(DEFAULT_BAND.t, 3);
    }));

  test("mandril: diâmetro = circunferência do pulso ÷ π, em pé, mais alto que a tira", () =>
    scoped(() => {
      const out = buildBand(M, B({ wrist: 157.08 }), null, { preview: false });
      const [w, h, z] = modelSize(out.mandrel[0]);
      expect(w).toBeCloseTo(50, 0);
      expect(h).toBeCloseTo(50, 0);
      expect(z).toBeCloseTo(DEFAULT_BAND.width + 8, 3);
      expect(out.info.mandrelD).toBeCloseTo(50, 1);
      // a folga do mandril o alarga
      expect(buildBand(M, B({ wrist: 157.08, mandrelEase: 6.28 }), null, { preview: false }).info.mandrelD).toBeCloseTo(52, 1);
    }));

  test("abertura em C: a tira dá menos de uma volta; negativa, mais de uma", () =>
    scoped(() => {
      expect(buildBand(M, B({ opening: 25 }), null, { preview: false }).info.sweep).toBeLessThan(360);
      expect(buildBand(M, B({ opening: 0 }), null, { preview: false }).info.sweep).toBeCloseTo(360, 3);
      const wrap = buildBand(M, B({ opening: -12 }), null, { preview: false });
      expect(wrap.info.sweep).toBeGreaterThan(360);
      expect(wrap.info.length).toBe(DEFAULT_BAND.wrist + 12);
      expect(wrap.warnings.join(" ")).toMatch(/se sobrepõem/);
    }));

  test("abertura pequena demais avisa que a mão não passa", () =>
    scoped(() => {
      expect(buildBand(M, B({ opening: 3 }), null, { preview: false }).warnings.join(" ")).toMatch(/não passa pela mão/);
      expect(buildBand(M, B(), null, { preview: false }).warnings).toEqual([]);
    }));

  test("malha deixa furos na tira (menos material); o desenho vira outra cor, dentro da borda", () =>
    scoped((k) => {
      const solid = buildBand(M, B(), null, { preview: false });
      const mesh = buildBand(M, B({ mesh: "honeycomb" }), null, { preview: false });
      expect(modelVolume(mesh.strip[0])).toBeLessThan(modelVolume(solid.strip[0]) * 0.85);
      const art = k(M.CrossSection.square([40, 8], true));
      const withArt = buildBand(M, B(), art, { preview: false });
      expect(withArt.strip[0].parts.map((q) => q.name)).toEqual(["Borda", "Tira", "Desenho"]);
      expect(new Set(withArt.strip[0].parts.map((q) => q.color)).size).toBeGreaterThanOrEqual(2);
      expect(solid.strip[0].parts.map((q) => q.name)).toEqual(["Borda", "Tira"]);
    }));

  test("prévia: a tira enrolada no mandril tem o raio do mandril + espessura e a altura da largura", () =>
    scoped(() => {
      const out = buildBand(M, B({ wrist: 157.08 }), null);
      const strip = out.assembled.parts.filter((q) => q.name !== "Mandril");
      const b = meshBounds(strip.map((q) => q.mesh))!;
      const rMax = Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[1]), Math.abs(b.max[1]));
      expect(rMax).toBeLessThanOrEqual(25 + DEFAULT_BAND.t + 0.2);
      expect(rMax).toBeGreaterThan(25 + DEFAULT_BAND.t - 0.3);
      expect(b.max[2] - b.min[2]).toBeCloseTo(DEFAULT_BAND.width, 0);
      // a abertura do C fica atrás (+y): a nuvem de pontos não fecha o círculo e o meio da tira está de frente (−y)
      const ys = strip.flatMap((q) => [...q.mesh.positions].filter((_, i) => i % 3 === 1));
      expect(ys.filter((y) => y > 24.5).length).toBe(0);
      expect(Math.min(...ys)).toBeLessThan(-25);
    }));
});
