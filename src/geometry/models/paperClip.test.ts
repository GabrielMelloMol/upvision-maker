import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import { meshBounds } from "../bounds";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildPaperClip, DEFAULT_PAPER_CLIP, paperClipPath } from "./paperClip";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const p = DEFAULT_PAPER_CLIP;

describe("clipe de papel (#213)", () => {
  test("o clipe tem o tamanho pedido, é uma peça só, fechada, deitada na mesa e com a altura da fita", () => {
    const { models } = buildPaperClip({ ...ctx, text: () => null }, p);
    const clip = solid(models[0].parts[0].mesh);
    expect(clip.status()).toBe("NoError");
    expect(clip.decompose()).toHaveLength(1);
    const b = clip.boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo(p.length, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(p.width, 1);
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(p.thickness, 3);
  });

  test("a fita não fecha o vão: entre duas voltas vizinhas há folga para o papel", () => {
    const clip = solid(buildPaperClip({ ...ctx, text: () => null }, p).models[0].parts[0].mesh);
    // uma sonda estreita atravessando as quatro fitas no meio do clipe deixa vãos de pelo menos 0,8 mm entre elas
    const x = p.length * 0.6;
    const ys: number[] = [];
    let inside = false;
    for (let y = 0; y <= p.width + 0.5; y += 0.1) {
      const hit = clip.intersect(M.Manifold.cube([0.05, 0.08, 1], true).translate([x, y, p.thickness / 2])).volume() > 1e-6;
      if (hit !== inside) ys.push(y);
      inside = hit;
    }
    expect(ys.length).toBeGreaterThanOrEqual(8); // 4 fitas = 8 bordas
    const gaps = [ys[2] - ys[1], ys[4] - ys[3], ys[6] - ys[5]];
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(0.8);
  });

  test("a linha central tem as três voltas dentro da caixa do clipe", () => {
    const pts = paperClipPath(p.length, p.width, p.band);
    for (const [x, y] of pts) {
      expect(y).toBeGreaterThanOrEqual(p.band / 2 - 1e-6);
      expect(y).toBeLessThanOrEqual(p.width - p.band / 2 + 1e-6);
      expect(x).toBeLessThanOrEqual(p.length + 1e-6);
    }
  });

  test("com texto sai a cabeça emendada no clipe (uma peça só) e a arte em relevo por cima, sem sobrepor", () => {
    const { models } = buildPaperClip(ctx, p);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Clipe", "Arte"]);
    const clip = solid(models[0].parts[0].mesh);
    expect(clip.decompose()).toHaveLength(1);
    expect(clip.boundingBox().min[0]).toBeLessThan(-5); // a cabeça está à esquerda
    const art = solid(models[0].parts[1].mesh);
    expect(clip.intersect(art).volume()).toBeCloseTo(0, 3);
    const b = meshBounds(models[0].parts.map((x) => x.mesh))!;
    expect(b.max[2]).toBeCloseTo(p.thickness + p.relief, 3);
  });
});
