import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import { meshBounds } from "../bounds";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { bookStandProfile, buildBookStand, buildBookThumb, DEFAULT_BOOK_STAND, DEFAULT_BOOK_THUMB, windowsFor } from "./bookHolder";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

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
  const TURN = 65; // a peça sai girada para a câmera ver a frente em ¾
  /** O sólido de volta na pose do projeto (frente para −x, largura em y). */
  const upright = (m: Mesh): Solid => solid(m).rotate([0, 0, -TURN]);

  test("duas cores e o nome: corpo (base e apoio) e batente com pés, fechados, sem se sobrepor e apoiados na mesa", () => {
    const { models } = buildBookStand(ctx, p);
    expect(models[0].parts.map((x) => x.name)).toEqual(["Suporte", "Batente e pés", "Nome"]);
    const [body, accent, name] = models[0].parts.map((x) => solid(x.mesh));
    for (const s of [body, accent, name]) expect(s.status()).toBe("NoError");
    expect(body.decompose()).toHaveLength(1);
    expect(body.intersect(accent).volume()).toBeCloseTo(0, 2);
    expect(body.intersect(name).volume()).toBeCloseTo(0, 3);
    expect(accent.intersect(name).volume()).toBeCloseTo(0, 3);
    const bounds = meshBounds(models[0].parts.map((x) => x.mesh))!;
    expect(bounds.min[2]).toBeCloseTo(0, 6);
    expect(bounds.max[2]).toBeCloseTo(bookStandProfile(p).top[1] + p.plate * Math.sin((p.tilt * Math.PI) / 180), 1); // a altura é a do canto de fora do apoio inclinado, não maior (a transformação do apoio certa)
  });

  test("a base tem a largura pedida e os cantos arredondados (sem quina na planta)", () => {
    const body = upright(buildBookStand(ctx, p).models[0].parts[0].mesh);
    const b = body.boundingBox();
    expect(b.max[1] - b.min[1]).toBeCloseTo(p.width, 1);
    // o canto da base é cortado: uma sonda no canto de trás da planta não toca a peça
    const g = bookStandProfile(p);
    const corner = M.Manifold.cube([1, 1, 2], true).translate([g.baseLen - 0.8, p.width / 2 - 0.8, 1]);
    expect(body.intersect(corner).volume()).toBeCloseTo(0, 3);
  });

  test("o apoio tem janelas em arco: vazado de verdade, por onde passa luz, e mais leve que o apoio liso", () => {
    const g = bookStandProfile(p);
    const body = upright(buildBookStand(ctx, p).models[0].parts[0].mesh);
    const a = (p.tilt * Math.PI) / 180;
    // um ponto no meio da altura do apoio, no centro de uma janela (mundo): ao longo da inclinação a 0,55 da altura
    const mid = g.along(p.height * 0.55, p.plate / 2);
    const n = windowsFor(p.width);
    const slot = (p.width - 32) / n;
    const cx = -p.width / 2 + 16 + slot * 0.5;
    const probe = M.Manifold.cube([0.6, 0.6, 0.6], true).translate([mid[0], -cx, mid[1]]); // x local → −y no mundo
    expect(body.intersect(probe).volume()).toBeCloseTo(0, 4);
    expect(a).toBeGreaterThan(0);
    // e fora da janela (a parede entre duas) há material
    const wall = M.Manifold.cube([0.6, 0.6, 0.6], true).translate([mid[0], -(cx + slot / 2), mid[1]]);
    expect(body.intersect(wall).volume()).toBeGreaterThan(0.1);
  });

  test("em larguras em que a diagonal passaria da mesa, a peça sai reta (sem a volta de ¾), cabendo na mesa", () => {
    const wide = { ...p, width: 300 };
    const b = meshBounds(buildBookStand(ctx, wide).models[0].parts.map((x) => x.mesh))!;
    expect(b.max[1] - b.min[1]).toBeGreaterThanOrEqual(300); // largura em y (com os pés): sem girar
    expect(b.max[0] - b.min[0]).toBeLessThan(200);
    // e no padrão gira
    const d = meshBounds(buildBookStand(ctx, p).models[0].parts.map((x) => x.mesh))!;
    expect(d.max[0] - d.min[0]).toBeGreaterThan(p.width * 0.9); // girado: a largura se espalha em x
  });

  test("o número de janelas cresce com a largura, de 2 a 5", () => {
    expect([windowsFor(60), windowsFor(120), windowsFor(220)]).toEqual([2, 3, 5]);
  });

  test("o apoio inclina para trás no ângulo pedido e o vão do livro tem a espessura pedida", () => {
    const g = bookStandProfile(p);
    const body = upright(buildBookStand(ctx, p).models[0].parts[0].mesh);
    const dx = g.along(p.height)[0] - g.foot[0], dz = g.along(p.height)[1] - g.foot[1];
    expect((Math.atan2(dx, dz) * 180) / Math.PI).toBeCloseTo(p.tilt, 3);
    const livro = M.Manifold.cube([p.thick - 0.2, p.width - 20, 6], false).translate([4.1, -(p.width - 20) / 2, p.plate]);
    expect(body.intersect(livro).volume()).toBeCloseTo(0, 3);
  });

  test("não tomba: o centro de massa fica sobre a base", () => {
    const g = bookStandProfile(p);
    const all = [0, 1].map((i) => upright(buildBookStand(ctx, p).models[0].parts[i].mesh));
    const vol = all.map((s) => s.volume());
    const cx = (all[0].volume() * centroidOf(all[0]) + all[1].volume() * centroidOf(all[1])) / (vol[0] + vol[1]);
    expect(cx).toBeGreaterThan(g.foot[0] - 20);
    expect(cx).toBeLessThan(g.baseLen);
  });

  test("os pés laterais ficam nas duas pontas da largura e sobem pela traseira do apoio", () => {
    const g = bookStandProfile(p);
    const accent = upright(buildBookStand(ctx, p).models[0].parts[1].mesh);
    const feet = accent.decompose().filter((s) => s.boundingBox().max[2] > p.lip + 5);
    expect(feet).toHaveLength(2);
    const ys = feet.map((s) => (s.boundingBox().min[1] + s.boundingBox().max[1]) / 2).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(-p.width / 2 + 6);
    expect(ys[1]).toBeGreaterThan(p.width / 2 - 6);
    expect(Math.max(...feet.map((s) => s.boundingBox().max[2]))).toBeGreaterThan(g.along(p.height * 0.4)[1]);
  });

  test("o nome fica em relevo na frente do batente, sem entrar nele", () => {
    const name = upright(buildBookStand(ctx, p).models[0].parts[2].mesh);
    const t = name.boundingBox();
    expect(t.max[0]).toBeCloseTo(0, 3);
    expect(t.min[0]).toBeCloseTo(-p.relief, 3);
    expect(t.max[2]).toBeLessThanOrEqual(p.lip);
  });

  test("sem nome, só o corpo e o batente com os pés", () => {
    expect(buildBookStand({ ...ctx, text: () => null }, p).models[0].parts.map((x) => x.name)).toEqual(["Suporte", "Batente e pés"]);
  });
});

/** Posição média em x (pelo centro de massa) de um sólido. */
function centroidOf(s: Solid): number {
  const m = s.getMesh();
  let v = 0, cx = 0;
  const pos = m.vertProperties, idx = m.triVerts, n = m.numProp;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i] * n, idx[i + 1] * n, idx[i + 2] * n];
    const vol = (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
    v += vol;
    cx += (vol * (pos[a] + pos[b] + pos[c])) / 4;
  }
  return cx / v;
}
