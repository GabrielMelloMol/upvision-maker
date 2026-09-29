import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { buildBookmark, DEFAULT_BOOKMARK } from "./bookmark";
import type { ModelCtx, ModelOutput } from "./common";
import { buildPetTag, DEFAULT_PET_TAG } from "./petTag";
import { buildPixPlate, DEFAULT_PIX_PLATE } from "./pixPlate";
import { buildProfessionPlaque, DEFAULT_PROFESSION } from "./professionPlaque";
import { buildQrPlate, DEFAULT_QR_PLATE } from "./qrPlate";
import { buildSignPlate, DEFAULT_SIGN_PLATE } from "./signPlate";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (offsets: Record<string, [number, number]> = {}, art: ModelCtx["art"] = null): ModelCtx => ({
  M,
  art,
  text: (s, h) => (s.trim() ? M.CrossSection.square([0.5 * h * s.trim().length, h], true) : null),
  offset: (id) => offsets[id] ?? [0, 0],
});
const partBox = (o: ModelOutput, name: string) => meshBounds([o.models[0].parts.find((q) => q.name === name)!.mesh])!;
const mid = (b: { min: number[]; max: number[] }, axis: 0 | 1) => (b.min[axis] + b.max[axis]) / 2;
/** O elemento `id` anda exatamente o deslocamento pedido, e a caixa informada anda junto. */
function movesWith(build: (c: ModelCtx) => ModelOutput, id: string, d: [number, number]) {
  const a = build(ctx()).elements!.find((e) => e.id === id)!.box;
  const b = build(ctx({ [id]: d })).elements!.find((e) => e.id === id)!.box;
  expect(b[0] - a[0]).toBeCloseTo(d[0], 3);
  expect(b[1] - a[1]).toBeCloseTo(d[1], 3);
}

describe("elementos internos centralizados e móveis (#79)", { timeout: 30_000 }, () => {
  test("placa de profissão: nome + profissão centralizados na coluna do texto (0,5 mm)", () => {
    const o = buildProfessionPlaque(ctx(), DEFAULT_PROFESSION);
    const t = partBox(o, "Nome");
    expect(Math.abs(mid(t, 1))).toBeLessThan(0.5);
    expect(o.elements!.map((e) => e.id)).toEqual(["texts", "symbol"]);
    movesWith((c) => buildProfessionPlaque(c, DEFAULT_PROFESSION), "texts", [3, -2]);
    movesWith((c) => buildProfessionPlaque(c, DEFAULT_PROFESSION), "symbol", [0, 4]);
  });

  test("tag de pet: nome no centro da área útil; arrastar até a borda corta e avisa", () => {
    const o = buildPetTag(ctx(), { ...DEFAULT_PET_TAG, shape: "circle" });
    const n = partBox(o, "Nome");
    expect(Math.abs(mid(n, 0))).toBeLessThan(0.5);
    expect(Math.abs(mid(n, 1))).toBeLessThan(0.5);
    movesWith((c) => buildPetTag(c, { ...DEFAULT_PET_TAG, shape: "circle" }), "name", [2, 3]);
    expect(buildPetTag(ctx({ name: [30, 0] }), { ...DEFAULT_PET_TAG, shape: "circle" }).warnings!.join(" ")).toMatch(/encosta na borda/);
  });

  test("sinalização, Pix, placa QR e marca-página: cada elemento anda com o gizmo", () => {
    movesWith((c) => buildSignPlate(c, DEFAULT_SIGN_PLATE), "text", [5, 2]);
    movesWith((c) => buildSignPlate({ ...c, art: M.CrossSection.circle(10, 32) }, DEFAULT_SIGN_PLATE), "panel", [3, 0]);
    const pix = { ...DEFAULT_PIX_PLATE, key: "a@b.com", name: "Ana", city: "Rio", subtitle: "Loja" };
    for (const id of ["title", "qr", "subtitle"]) movesWith((c) => buildPixPlate(c, pix), id, [1, -1]);
    for (const id of ["head", "qr"]) movesWith((c) => buildQrPlate(c, DEFAULT_QR_PLATE), id, [2, 1]);
    movesWith((c) => buildBookmark(c, DEFAULT_BOOKMARK), "text", [0, -5]);
  });
});
