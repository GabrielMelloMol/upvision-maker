import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildCutoutFrame, buildCutoutStand, DEFAULT_CUTOUT_FRAME as F, DEFAULT_CUTOUT_STAND as S, type CutoutFrameParams, type CutoutStandParams } from "./cutoutFrame";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text });
/** Contorno quadrado de 100 × 100 com traço de 4 mm: encosta nos 4 lados da sua caixa. */
const ring = (side = 100, line = 4) => M.CrossSection.square([side, side], true).subtract(M.CrossSection.square([side - 2 * line, side - 2 * line], true));
const frame = (p: Partial<CutoutFrameParams> = {}, art = ring()) => buildCutoutFrame(ctx(art), { ...F, stroke: 0, ...p });
const stand = (p: Partial<CutoutStandParams> = {}, art: ModelCtx["art"] = null) => buildCutoutStand(ctx(art), { ...S, ...p });
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("quadro vazado (#191)", { timeout: 60_000 }, () => {
  test("moldura no tamanho pedido (18 × 25 cm), apoiada na mesa, com o desenho dentro e na mesma espessura", () => {
    const out = frame({ width: 180, height: 250, thickness: 3 });
    const [fr, art] = out.models[0].parts;
    const b = meshBounds([fr.mesh])!;
    expect([b.max[0] - b.min[0], b.max[1] - b.min[1]].map((v) => Math.round(v))).toEqual([180, 250]);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(3);
    const a = meshBounds([art.mesh])!;
    expect([a.min[2], a.max[2]]).toEqual([expect.closeTo(0, 3), expect.closeTo(3, 3)]);
    expect(a.max[0]).toBeLessThanOrEqual(90 - 12 + 1e-6); // dentro do vão da moldura
  });

  test("lados presos: a ponte liga o traço à moldura (peça única) e só nos lados escolhidos", () => {
    const joined = (p: Partial<CutoutFrameParams>) => {
      const out = frame(p);
      const parts = out.models[0].parts.map((x) => solid(x.mesh));
      const all = parts.slice(1).reduce((s, x) => s.add(x), parts[0]);
      const n = all.decompose().length;
      [...parts, all].forEach((x) => x.delete());
      return n;
    };
    expect(joined({ tieTop: true, tieBottom: false, tieLeft: false, tieRight: false })).toBe(1);
    expect(joined({ tieTop: false, tieBottom: false, tieLeft: false, tieRight: false })).toBe(2); // desenho solto
    // lados escolhidos: a ponte de cima chega ao vão da moldura, a de baixo não existe
    const top = meshBounds([frame({ tieTop: true, tieBottom: false, tieLeft: false, tieRight: false }).models[0].parts[1].mesh])!;
    expect(top.max[1]).toBeCloseTo((250 - 24) / 2, 2);
    expect(top.min[1]).toBeGreaterThan(-(250 - 24) / 2 + 5);
    const all4 = meshBounds([frame({ tieTop: true, tieBottom: true, tieLeft: true, tieRight: true }).models[0].parts[1].mesh])!;
    expect(all4.min[1]).toBeCloseTo(-(250 - 24) / 2, 2);
    expect(all4.max[0]).toBeCloseTo((180 - 24) / 2, 2);
  });

  test("avisos: nenhum lado, lado em que o desenho não encosta, e pedaço que cairia", () => {
    expect(frame({ tieTop: false, tieBottom: false }).warnings!.join(" ")).toMatch(/Nenhum lado preso/);
    const island = M.CrossSection.union([ring(), M.CrossSection.square([10, 10], true)]); // quadradinho solto no miolo
    expect(frame({ tieTop: true, tieBottom: false }, island).warnings!.join(" ")).toMatch(/1 parte\(s\) do desenho não estão presas/);
    expect(frame().warnings).toEqual([]);
  });

  test("sem desenho usa o exemplo (coração), preso por cima e por baixo", () => {
    const out = buildCutoutFrame(ctx(), { ...F });
    expect(out.warnings).toEqual([]);
    expect(volume(out.models[0].parts[1].mesh)).toBeGreaterThan(0);
  });

  test("moldura larga demais para o tamanho: erro claro", () => {
    expect(() => frame({ width: 40, border: 18 })).toThrow(/moldura é larga demais/);
  });
});

describe("placa vazada em pé (#191)", { timeout: 60_000 }, () => {
  test("placa na altura pedida com lingueta embaixo; o texto sai vazado (volume tirado) e a base vem junto", () => {
    const out = stand({ text: "Amor", height: 100, margin: 8, thickness: 4 });
    expect(out.models.map((m) => m.name)[0]).toBe("Placa");
    expect(out.models).toHaveLength(2);
    const b = meshBounds([out.models[0].parts[0].mesh])!;
    expect(b.max[1] - b.min[1]).toBeCloseTo(100 + 8, 1); // placa + 8 mm de lingueta para fora
    expect(b.max[2]).toBeCloseTo(4);
    expect(b.min[2]).toBeCloseTo(0);
    // vazado: placa 184 × 100 + lingueta 50 × 8,5 menos o texto 168 × 84 (bloco de teste), × 4 mm
    const expected = (184 * 100 + 50 * 8.5 - 168 * 84) * 4;
    expect(Math.abs(volume(out.models[0].parts[0].mesh) / expected - 1)).toBeLessThan(0.03);
  });

  test("miolo de letra cai: ficou de fora e avisa; sem miolo não avisa", () => {
    const o = stand({}, ring(60, 8)); // anel: o miolo quadrado solta
    expect(o.warnings!.join(" ")).toMatch(/1 miolo\(s\) do desenho/);
    const noHoles = stand({}, M.CrossSection.square([60, 40], true));
    expect(noHoles.warnings).toEqual([]);
    // sem o miolo, o volume da placa não inclui um bloco solto: peça única
    const s = solid(o.models[0].parts[0].mesh);
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("texto e desenho: o desenho vence; sem nenhum dos dois pede dados", () => {
    expect(() => stand({ text: "" })).toThrow(MissingInput);
    const withArt = meshBounds([stand({ text: "Amor", height: 100, margin: 8 }, M.CrossSection.square([30, 80], true)).models[0].parts[0].mesh])!;
    expect(withArt.max[0] - withArt.min[0]).toBeCloseTo(30 * (84 / 80) + 16, 0); // arte (aspecto 30:80) na altura útil + margens
  });
});
