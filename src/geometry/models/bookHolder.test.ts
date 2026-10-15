import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import { meshBounds } from "../bounds";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { bookStandProfile, buildBookStand, buildBookThumb, DEFAULT_BOOK_STAND, DEFAULT_BOOK_THUMB } from "./bookHolder";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/** Centro de massa (y) de uma malha fechada, pela soma de tetraedros. */
function centroidY(m: Mesh): number {
  let v = 0, cx = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
    const vol = (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
    v += vol;
    cx += (vol * (p[a + 1] + p[b + 1] + p[c + 1])) / 4;
  }
  return cx / v;
}

describe("apoio de polegar (#213)", () => {
  test("anel com o furo do tamanho do polegar, aba e texto: fechados, sem sobreposição, deitados na mesa", () => {
    const { models } = buildBookThumb(ctx, DEFAULT_BOOK_THUMB);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Anel", "Aba", "Texto"]);
    const s = models[0].parts.map((x) => solid(x.mesh));
    s.forEach((x) => expect(x.status()).toBe("NoError"));
    expect(s[0].genus()).toBe(1);
    // o polegar passa: um cilindro do diâmetro do furo não toca o anel
    const thumb = M.Manifold.cylinder(30, DEFAULT_BOOK_THUMB.thumb / 2 - 0.01, DEFAULT_BOOK_THUMB.thumb / 2 - 0.01, 64);
    expect(s[0].intersect(thumb).volume()).toBeCloseTo(0, 3);
    expect(s[0].intersect(s[1]).volume()).toBeCloseTo(0, 3);
    expect(s[1].intersect(s[2]).volume()).toBeCloseTo(0, 3);
    const b = meshBounds(models[0].parts.map((x) => x.mesh))!;
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[2]).toBeCloseTo(DEFAULT_BOOK_THUMB.ringH, 3); // o anel é a parte mais alta
  });

  test("a aba chega ao comprimento pedido e o texto cabe nela", () => {
    const { models } = buildBookThumb(ctx, DEFAULT_BOOK_THUMB);
    const tab = meshBounds([models[0].parts[1].mesh])!;
    expect(tab.max[0]).toBeCloseTo(DEFAULT_BOOK_THUMB.thumb / 2 + DEFAULT_BOOK_THUMB.wall + DEFAULT_BOOK_THUMB.length, 1);
    const t = meshBounds([models[0].parts[2].mesh])!;
    expect(t.max[0]).toBeLessThanOrEqual(tab.max[0]);
    expect(Math.max(Math.abs(t.min[1]), Math.abs(t.max[1]))).toBeLessThan(DEFAULT_BOOK_THUMB.tabW / 2);
  });
});

describe("suporte de livro de mesa (#213)", () => {
  const p = DEFAULT_BOOK_STAND;

  test("uma peça só, fechada, apoiada na mesa, com a largura pedida", () => {
    const { models } = buildBookStand(ctx, p);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Suporte", "Texto"]);
    const body = solid(models[0].parts[0].mesh);
    expect(body.status()).toBe("NoError");
    expect(body.decompose()).toHaveLength(1);
    const b = body.boundingBox();
    expect(b.min[2]).toBeCloseTo(0, 6);
    expect(b.max[0] - b.min[0]).toBeCloseTo(p.width, 2); // a largura corre em x; a frente aponta para −y
    expect(b.min[0] + b.max[0]).toBeCloseTo(0, 3); // centrado
  });

  test("o apoio inclina para trás no ângulo pedido e o vão do livro tem a espessura pedida", () => {
    const g = bookStandProfile(p);
    const body = solid(buildBookStand(ctx, p).models[0].parts[0].mesh);
    // o topo do apoio está atrás do pé, pela tangente do ângulo
    const dx = g.along(p.height)[0] - g.foot[0], dz = g.along(p.height)[1] - g.foot[1];
    expect((Math.atan2(dx, dz) * 180) / Math.PI).toBeCloseTo(p.tilt, 3);
    // vão livre entre o batente e o apoio, na altura da base: o livro grosso máximo passa
    const livro = M.Manifold.cube([p.width - 20, p.thick - 0.2, 6], false).translate([-(p.width - 20) / 2, 4.1, p.plate]);
    expect(body.intersect(livro).volume()).toBeCloseTo(0, 3);
  });

  test("não tomba: o centro de massa fica sobre a base", () => {
    const g = bookStandProfile(p);
    const cy = centroidY(buildBookStand(ctx, p).models[0].parts[0].mesh);
    expect(cy).toBeGreaterThan(g.foot[0] - 20); // a base vai de y = 0 (batente) a y = baseLen
    expect(cy).toBeLessThan(g.baseLen);
  });

  test("o texto fica em relevo na frente do batente, sem entrar nele", () => {
    const { models } = buildBookStand(ctx, p);
    const t = meshBounds([models[0].parts[1].mesh])!;
    expect(t.max[1]).toBeCloseTo(0, 3);
    expect(t.min[1]).toBeCloseTo(-p.relief, 3);
    expect(t.max[2]).toBeLessThanOrEqual(p.lip);
    expect(solid(models[0].parts[0].mesh).intersect(solid(models[0].parts[1].mesh)).volume()).toBeCloseTo(0, 3);
  });

  test("sem texto, só o suporte", () => {
    expect(buildBookStand({ ...ctx, text: () => null }, p).models[0].parts).toHaveLength(1);
  });
});
