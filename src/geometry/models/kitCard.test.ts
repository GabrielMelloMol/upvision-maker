import { beforeAll, describe, expect, test } from "vitest";
import { setBed } from "../bed";
import { meshBounds } from "../bounds";
import type { CS, ManifoldToplevel } from "../manifold";
import { getManifold } from "../manifold";
import { scoped } from "../shape2d";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { bestScale, buildKitCard, buildPieces, CARD_MM, DEFAULT_KIT_CARD as D, gateWidth, packRows, pieceDims, type KitCardParams } from "./kitCard";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** Silhueta de teste: uma "fuselagem" 100 × 24 (retângulo com a ponta afinada), sempre cheia. */
const fuselage = () => new M.CrossSection([[[0, 0], [90, 0], [100, 12], [90, 24], [0, 24]]], "NonZero");
/** Vista de cima: "asas", 100 × 60 (losango largo). */
const wings = () => new M.CrossSection([[[0, 30], [50, 0], [100, 30], [50, 60]]], "NonZero");
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: CS | null = fuselage(), art2: CS | null = wings()): ModelCtx => ({ M, art, art2, text });
const build = (p: Partial<KitCardParams> = {}, c: ModelCtx = ctx()) => buildKitCard(c, { ...D, ...p });
const part = (o: ReturnType<typeof build>, name: string) => o.models[0].parts.find((x) => x.name === name)?.mesh;
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
/** Área da fatia do corpo na altura z. */
const areaAt = (m: Parameters<typeof solid>[0], z: number) => {
  const s = solid(m), cs = s.slice(z), a = cs.area();
  cs.delete();
  s.delete();
  return a;
};

describe("kit card (#193)", { timeout: 60_000 }, () => {
  test("cartão no tamanho escolhido (cartão de crédito ou maior), na mesa, na espessura pedida, com o título em relevo", () => {
    for (const size of ["credit", "medium", "large"] as const) {
      const o = build({ cardSize: size, thickness: 1.6, showAssembled: false }, ctx(fuselage(), size === "credit" ? null : wings())); // no cartão de crédito cabe a lateral com a base
      const b = meshBounds([part(o, "Cartão")!])!;
      expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([expect.closeTo(CARD_MM[size][0], 1), expect.closeTo(CARD_MM[size][1], 1)]);
      expect(b.min[2]).toBeCloseTo(0);
      expect(b.max[2]).toBeCloseTo(1.6, 3);
    }
    expect(CARD_MM.credit).toEqual([85.6, 54]);
    const t = meshBounds([part(build({ relief: 0.6, showAssembled: false }), "Título")!])!;
    expect([t.min[2], t.max[2]]).toEqual([expect.closeTo(1.6, 3), expect.closeTo(2.2, 3)]);
  });

  test("as peças cabem no vão da moldura e nada se sobrepõe: peças entre si, peças e moldura (mín. a folga pedida)", () => {
    const o = build({ cardSize: "medium", gap: 4, frame: 3.5, showAssembled: false });
    const pieces = solid(part(o, "Peças")!), frame = solid(part(o, "Cartão")!);
    const parts = pieces.decompose();
    expect(parts.length).toBe(3); // lateral, vista de cima e base
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const x = parts[i].intersect(parts[j]);
        expect(x.volume()).toBeLessThan(1e-6);
        x.delete();
      }
    // as peças e a moldura não dividem volume (só se encostam nos pontos de corte, que são da moldura)
    const overlap = pieces.intersect(frame);
    expect(overlap.volume()).toBeLessThan(1e-3);
    // folga: nenhuma peça chega perto da borda interna da moldura
    const pb = meshBounds([part(o, "Peças")!])!;
    const [W, H] = CARD_MM.medium;
    expect(pb.min[0]).toBeGreaterThan(-W / 2 + 3.5 + 4 - 1e-3);
    expect(pb.max[0]).toBeLessThan(W / 2 - 3.5 - 4 + 1e-3);
    expect(pb.max[1]).toBeLessThan(H / 2 - 3.5 - 4 + 1e-3);
    [pieces, frame, overlap, ...parts].forEach((s) => s.delete());
  });

  test("as fendas casam com a espessura + a folga: a vista de cima entra na lateral (e vice-versa) sem colidir, e a folga é a pedida", () => {
    for (const fit of [0.1, 0.2, 0.35]) {
      scoped((k) => {
        const p = { thickness: 1.6, fit, crossPct: 50 };
        const pcs = buildPieces(M, fuselage(), wings(), p, 0.8, k);
        expect(pcs.slotW).toBeCloseTo(1.6 + fit, 6);
        // mede a abertura da fenda da lateral: coluna a 3/4 do comprimento, de cima a baixo
        const colX = pcs.w / 4;
        const col = k(k(M.CrossSection.square([0.2, 1000], true)).translate([colX, 0]));
        const parts = k(pcs.side.intersect(col)).decompose().map(k).map((c) => c.bounds()).sort((a, b) => a.min[1] - b.min[1]);
        expect(parts.length).toBe(2); // abaixo e acima da fenda
        expect(parts[1].min[1] - parts[0].max[1]).toBeCloseTo(1.6 + fit, 3);
        // e a da vista de cima, na coluna a 1/4 (lado esquerdo)
        const colL = k(k(M.CrossSection.square([0.2, 1000], true)).translate([-pcs.w / 4, 0]));
        const tp = k(pcs.top!.intersect(colL)).decompose().map(k).map((c) => c.bounds()).sort((a, b) => a.min[1] - b.min[1]);
        expect(tp.length).toBe(2);
        expect(tp[1].min[1] - tp[0].max[1]).toBeCloseTo(1.6 + fit, 3);
        // janela da base = lingueta + folga
        const wb = k(k(M.CrossSection.square([0.2, 1000], true)).translate([0, 0]));
        const win = k(pcs.base.intersect(wb)).decompose().map(k).map((c) => c.bounds()).sort((a, b) => a.min[1] - b.min[1]);
        expect(win[1].min[1] - win[0].max[1]).toBeCloseTo(1.6 + fit, 3);
      });
    }
  });

  test("o modelo montado de prévia: sem colisão entre lateral, vista de cima e base, e é só prévia", () => {
    const o = build({ cardSize: "large", showAssembled: true, fit: 0.2 });
    expect(o.models).toHaveLength(2);
    const prev = o.models[1];
    expect(prev.previewOnly).toBe(true);
    expect(o.models[0].previewOnly).toBeUndefined();
    const [base, side, top] = ["Montado: base", "Montado: lateral", "Montado: vista de cima"].map((n) => solid(prev.parts.find((q) => q.name === n)!.mesh));
    for (const [a, b] of [[side, top], [side, base], [top, base]] as const) {
      const x = a.intersect(b);
      expect(x.volume(), "colisão").toBeLessThan(1e-6);
      x.delete();
    }
    // a vista de cima fica na altura do cruzamento: no meio da lateral
    const tb = top.boundingBox(), sb = side.boundingBox();
    expect((tb.min[2] + tb.max[2]) / 2).toBeGreaterThan(sb.min[2] + (sb.max[2] - sb.min[2]) * 0.3);
    expect((tb.min[2] + tb.max[2]) / 2).toBeLessThan(sb.min[2] + (sb.max[2] - sb.min[2]) * 0.7);
    // a prévia fica ao lado do cartão, não em cima
    expect(meshBounds(prev.parts.map((q) => q.mesh))!.min[0]).toBeGreaterThan(CARD_MM.large[0] / 2);
    [base, side, top].forEach((s) => s.delete());
  });

  test("pontos de corte finos: mais finos que a placa (2 camadas), largos só o necessário para o bico, e cada peça tem 2 por junção", () => {
    const o = build({ showAssembled: false, thickness: 1.6 });
    const card = part(o, "Cartão")!;
    const full = areaAt(card, 1.0); // acima dos pontos de corte (0,4 mm): só a moldura
    const withGates = areaAt(card, 0.2);
    const gatesArea = withGates - full;
    expect(gatesArea).toBeGreaterThan(0);
    expect(areaAt(card, 0.5)).toBeCloseTo(full, 3); // acima de 0,4 mm já não há ponto de corte
    // 3 peças em 1 fileira → 4 junções × 2 pontos, de largura gateWidth (≥ 0,8 mm) e comprimento da folga
    const gw = gateWidth();
    expect(gw).toBeGreaterThanOrEqual(0.8);
    const meanLen = gatesArea / (8 * gw);
    expect(meanLen).toBeGreaterThan(1);
    expect(meanLen).toBeLessThan(25);
    // a placa das peças é mais grossa que os pontos de corte
    expect(meshBounds([part(o, "Peças")!])!.max[2]).toBeGreaterThan(0.4 * 3);
  });

  test("bico: o ponto de corte e o aviso de partes finas seguem o bico da impressora (bed.nozzle)", () => {
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.6 });
    try {
      expect(gateWidth()).toBeCloseTo(1.2, 6);
      // pente: uma base e 40 dentes de 0,4 mm de largura (mais finos que o bico de 0,6 mm)
      const teeth = Array.from({ length: 40 }, (_, i) => new M.CrossSection([[[i * 2.5, 6], [i * 2.5 + 0.4, 6], [i * 2.5 + 0.4, 36], [i * 2.5, 36]]], "NonZero"));
      const thin = M.CrossSection.union([new M.CrossSection([[[0, 0], [100, 0], [100, 6], [0, 6]]], "NonZero"), ...teeth]);
      const w = build({ showAssembled: false }, ctx(thin, null)).warnings!.join(" ");
      expect(w).toMatch(/partes mais finas que o bico \(0,6 mm\)/);
      expect(build({ showAssembled: false, frame: 2 }).warnings!.join(" ")).toMatch(/Moldura de 2 mm é fina para o bico de 0,6 mm/);
    } finally {
      setBed(null);
    }
    expect(build({ showAssembled: false }).warnings!.join(" ")).not.toMatch(/mais finas que o bico/);
  });

  test("sem segunda imagem: só lateral e base; cartão de crédito diminui as peças para caber, e um muito alto não cabe", () => {
    const one = build({ cardSize: "credit", showAssembled: true }, ctx(fuselage(), null));
    expect(solid(part(one, "Peças")!).decompose().length).toBe(2);
    expect(one.models[1].parts.map((q) => q.name)).toEqual(["Montado: base", "Montado: lateral"]);
    const scale = bestScale(1.6, 0.2, 0.24, 0.6, CARD_MM.credit[0] - 7, CARD_MM.credit[1] - 7 - 6.5, 4);
    const big = bestScale(1.6, 0.2, 0.24, 0.6, CARD_MM.large[0] - 7, CARD_MM.large[1] - 7 - 14, 4);
    expect(big).toBeGreaterThan(scale);
    const tall = new M.CrossSection([[[0, 0], [10, 0], [10, 300], [0, 300]]], "NonZero");
    expect(() => build({ cardSize: "credit" }, ctx(tall, null))).toThrow(/não cabem/);
  });

  test("arrumação em fileiras respeita a folga; imagem obrigatória", () => {
    const dims = pieceDims(1, 1.6, 0.2, 0.3, 0.5);
    expect(packRows(dims, 400, 200, 4)!.rows).toHaveLength(1);
    const two = packRows(dims, 170, 200, 4)!;
    expect(two.rows.length).toBeGreaterThan(1);
    two.gapH.forEach((g) => expect(g).toBeGreaterThanOrEqual(4 - 1e-9));
    expect(two.gapV).toBeGreaterThanOrEqual(4);
    expect(packRows(dims, 90, 200, 4)).toBeNull();
    expect(() => build({}, ctx(null, null))).toThrow(MissingInput);
    expect(volume(part(build({ showAssembled: false }), "Peças")!)).toBeGreaterThan(0);
  });
});
