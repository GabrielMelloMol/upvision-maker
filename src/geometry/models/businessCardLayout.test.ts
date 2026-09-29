import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { buildBusinessCard, DEFAULT_BUSINESS_CARD as D, type BusinessCardParams } from "./businessCard";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (offsets: Record<string, [number, number]> = {}): ModelCtx => ({
  M,
  art: null,
  text: (s, h) => (s.trim() ? M.CrossSection.square([0.5 * h * s.trim().length, h], true) : null),
  offset: (id) => offsets[id] ?? [0, 0],
});
const build = (p: Partial<BusinessCardParams> = {}, offsets = {}) => buildBusinessCard(ctx(offsets), { ...D, ...p });
const box = (p: Partial<BusinessCardParams>, name: string, offsets = {}) => meshBounds([build(p, offsets).models[0].parts.find((q) => q.name === name)!.mesh])!;
const mid = (b: { min: number[]; max: number[] }, axis: 0 | 1) => (b.min[axis] + b.max[axis]) / 2;

describe("cartão de visita: posição dos elementos (#79)", { timeout: 30_000 }, () => {
  test("sem QR: bloco de texto centralizado no cartão 85×54 (0,5 mm)", () => {
    const t = box({ link: "" }, "Textos");
    expect(Math.abs(mid(t, 0))).toBeLessThan(0.5);
    expect(Math.abs(mid(t, 1))).toBeLessThan(0.5);
  });

  test("com QR à direita: texto centralizado na altura e na coluna dele; QR centralizado na altura", () => {
    const t = box({}, "Textos"), q = box({}, "QR");
    expect(Math.abs(mid(t, 1))).toBeLessThan(0.5);
    expect(Math.abs(mid(q, 1))).toBeLessThan(0.5);
    // coluna do texto: da margem esquerda até o QR (5 mm de margem e de espaço)
    expect(Math.abs(mid(t, 0) - (-42.5 + 5 + (85 - 10 - 35) / 2))).toBeLessThan(0.5);
    expect(q.min[0]).toBeGreaterThan(t.max[0]);
  });

  test("arrumações: QR à esquerda, QR em cima e só texto", () => {
    const tl = box({ layout: "qrLeft" }, "Textos"), ql = box({ layout: "qrLeft" }, "QR");
    expect(ql.max[0]).toBeLessThan(tl.min[0]);
    const tt = box({ layout: "qrTop" }, "Textos"), qt = box({ layout: "qrTop" }, "QR");
    expect(qt.min[1]).toBeGreaterThan(tt.max[1]);
    expect(Math.abs(mid(qt, 0))).toBeLessThan(0.5);
    expect(build({ layout: "textOnly" }).models[0].parts.some((q) => q.name === "QR")).toBe(false);
  });

  test("em cima / embaixo, alinhamento das linhas e espaço entre linhas", () => {
    const top = box({ link: "", blockY: "top" }, "Textos"), bottom = box({ link: "", blockY: "bottom" }, "Textos");
    expect(top.max[1]).toBeCloseTo(27 - 5, 1);
    expect(bottom.min[1]).toBeCloseTo(-27 + 5, 1);
    const tight = box({ link: "", lineGap: 0.5 }, "Textos"), loose = box({ link: "", lineGap: 4 }, "Textos");
    expect(loose.max[1] - loose.min[1]).toBeCloseTo(tight.max[1] - tight.min[1] + 3 * 3.5, 1);
  });

  test("arrastar no gizmo desloca o elemento; elementos saem com as caixas; fora da borda avisa", () => {
    const base = box({}, "Textos"), moved = box({}, "Textos", { texts: [0, 6] });
    expect(mid(moved, 1) - mid(base, 1)).toBeCloseTo(6, 3);
    const out = build({}, { qr: [0, 20] });
    expect(out.elements!.map((e) => e.id)).toEqual(["texts", "qr"]);
    const qrBox = out.elements!.find((e) => e.id === "qr")!.box;
    expect(qrBox[3] - qrBox[1]).toBeCloseTo(30);
    expect(out.warnings!.join(" ")).toMatch(/QR: passa da borda/);
  });
});
