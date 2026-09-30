import { beforeAll, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { buildMedalDesign, DEFAULT_MEDAL_DESIGN } from "./medalDesign";
import type { ModelCtx } from "./models/common";
import { buildQrList, buildQrPlate, DEFAULT_QR_LIST, DEFAULT_QR_PLATE } from "./models/qrPlate";
import { buildTrophy, DEFAULT_TROPHY } from "./models/trophy";

/** #146: o aviso de traço fino vale para a linha no tamanho final, depois de o modelo encolher o texto para caber. */
let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
// fonte falsa: bloco maciço de 0,5 × h por letra (traço fino só quando a linha encolhe muito)
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([0.5 * h * s.trim().length, h], true) : null);
const ctx = (): ModelCtx => ({ M, art: null, text });
const LONG = "Campeonato regional de natação infantil ".repeat(40);

test("medalha: linha reta encolhida e texto em arco pequeno avisam; tamanhos normais não", () => {
  const got: string[] = [];
  const mctx = { M, art: null, text: (s: string, h: number) => text(s, h), arc: (s: string, h: number) => text(s, h), warn: (m: string) => void got.push(m) };
  buildMedalDesign(mctx, { ...DEFAULT_MEDAL_DESIGN, center: LONG, top: "OURO", topSize: 0.3 });
  expect(got.some((w) => /^"Campeonato regional…" ficou com/.test(w))).toBe(true);
  expect(got.some((w) => w.startsWith('"OURO" ficou com 0,3 mm'))).toBe(true);
  got.length = 0;
  buildMedalDesign(mctx, DEFAULT_MEDAL_DESIGN);
  expect(got).toEqual([]);
});

test("troféu: texto da placa e da base encolhidos avisam", () => {
  const w = buildTrophy(ctx(), { ...DEFAULT_TROPHY, text: LONG, baseText: LONG }).warnings ?? [];
  expect(w.filter((x) => /^"Campeonato regional…" ficou com/.test(x))).toHaveLength(2);
  expect(buildTrophy(ctx(), DEFAULT_TROPHY).warnings ?? []).toEqual([]);
});

test("placa QR e placa com vários QRs: título/rótulo encolhidos avisam, uma vez cada", () => {
  const one = buildQrPlate(ctx(), { ...DEFAULT_QR_PLATE, title: LONG }).warnings ?? [];
  expect(one.filter((x) => x.includes("ficou com"))).toHaveLength(1);
  const list = buildQrList(ctx(), { ...DEFAULT_QR_LIST, title: LONG }).warnings ?? [];
  expect(list.filter((x) => x.includes("ficou com"))).toHaveLength(1);
});
