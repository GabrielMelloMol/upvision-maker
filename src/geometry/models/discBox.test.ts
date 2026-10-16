import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildDiscBox, DEFAULT_DISC_BOX, DISC_ITEMS, discBoxSizes, type DiscBoxParams, type DiscKind } from "./discBox";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const build = (over: Partial<DiscBoxParams> = {}) => buildDiscBox(ctx, { ...DEFAULT_DISC_BOX, ...over });

describe("caixa de discos (#214)", { timeout: 60_000 }, () => {
  test.each(Object.keys(DISC_ITEMS) as DiscKind[])("%s: caixa e tampa fechadas, o item cabe em pé no vão e a tampa cobre o que passa da caixa", (kind) => {
    const p = { ...DEFAULT_DISC_BOX, kind, count: 6 };
    const s = discBoxSizes(p);
    const out = buildDiscBox(ctx, p);
    const [box, lid] = out.models;
    const b = solid(box.parts[0].mesh);
    expect(b.status()).toBe("NoError");
    const bb = b.boundingBox();
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(s.outerX, 2);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(s.outerY, 2);
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(s.boxH, 2);
    // o interior (largura e profundidade) comporta o item com folga: o vão de cada um é a espessura + 1,4
    expect(s.innerY).toBeGreaterThan(s.it.depth + 2);
    // um item de pé no vão do meio não bate nas divisórias nem no fundo
    const slot = s.it.thick + 1.4;
    const x0 = -(6 * slot + 5 * 1.2) / 2 + 2 * (slot + 1.2) + 0.7;
    const item = M.Manifold.cube([s.it.thick, s.it.depth, s.it.height], false).translate([x0, -s.it.depth / 2, 2]);
    expect(b.intersect(item).volume()).toBeCloseTo(0, 3);
    // a tampa: vira de cabeça para baixo, com o topo na mesa; cavidade maior que a caixa (folga) e mais alta que o item que sobra
    const l = solid(lid.parts[0].mesh);
    expect(l.status()).toBe("NoError");
    const lb = l.boundingBox();
    expect(lb.min[2]).toBeCloseTo(0, 3);
    expect(lb.max[2]).toBeCloseTo(s.lidH, 2);
    expect(s.lidCavity).toBeGreaterThan(s.exposed + 8); // cobre o que passa da caixa e ainda desce sobre ela
    b.delete();
    l.delete();
  });

  test("a tampa encaixa na caixa: fechada, as duas peças não se sobrepõem e a folga é pequena", () => {
    const out = build({ layout: "assembled", kind: "slim", count: 8 });
    const closed = out.models.find((m) => m.previewOnly)!;
    const box = solid(closed.parts[0].mesh);
    const lid = solid(closed.parts[1].mesh);
    expect(box.intersect(lid).volume()).toBeCloseTo(0, 2);
    // a tampa cobre a caixa: sobe acima dela pela altura dos itens que sobram
    const s = discBoxSizes({ kind: "slim", count: 8 });
    expect(lid.boundingBox().max[2]).toBeGreaterThan(s.boxH + s.exposed);
    box.delete();
    lid.delete();
  });

  test("o nome é uma peça à parte, rente com o topo da tampa (o topo fica liso)", () => {
    const out = build();
    const lid = out.models[1];
    expect(lid.parts.map((x) => x.name)).toEqual(["Tampa", "Nome"]);
    const l = solid(lid.parts[0].mesh);
    const n = solid(lid.parts[1].mesh);
    const lb = l.boundingBox();
    const nb = n.boundingBox();
    expect(nb.min[2]).toBeCloseTo(0, 3); // o nome fica na camada da mesa (de cabeça para baixo)
    expect(nb.max[2]).toBeCloseTo(0.6, 2);
    expect(l.intersect(n).volume()).toBeCloseTo(0, 3);
    expect(nb.max[0] - nb.min[0]).toBeLessThan(lb.max[0] - lb.min[0]);
    // sem nome, só a tampa
    expect(build({ text: "" }).models[1].parts.map((x) => x.name)).toEqual(["Tampa"]);
    l.delete();
    n.delete();
  });

  test("o 3MF sai sempre com a caixa e a tampa na mesa; a caixa fechada é só prévia, ao lado", () => {
    const table = build();
    const asm = build({ layout: "assembled" });
    const printable = asm.models.filter((m) => !m.previewOnly);
    expect(printable.map((m) => m.parts.map((x) => Array.from(x.mesh.positions)))).toEqual(table.models.map((m) => m.parts.map((x) => Array.from(x.mesh.positions))));
    expect(asm.models.filter((m) => m.previewOnly)).toHaveLength(1);
    const tb = meshBounds(printable.flatMap((m) => m.parts.map((x) => x.mesh)))!;
    const pb = meshBounds(asm.models.find((m) => m.previewOnly)!.parts.map((x) => x.mesh))!;
    expect(pb.min[0]).toBeGreaterThan(tb.max[0]);
  });

  test("mais discos, caixa mais larga; entalhe nas duas paredes e divisórias baixas", () => {
    const a = discBoxSizes({ kind: "jewel", count: 5 });
    const b = discBoxSizes({ kind: "jewel", count: 15 });
    expect(b.outerX - a.outerX).toBeCloseTo(10 * (10.6 + 1.4 + 1.2), 3);
    const box = solid(build({ count: 5 }).models[0].parts[0].mesh);
    // no topo da parede, no meio da largura, a parede de trás e a da frente estão cortadas pelo entalhe
    const top = box.slice(a.boxH - 0.5);
    const lowerArea = box.slice(a.boxH - 12).area();
    expect(top.area()).toBeLessThan(lowerArea);
    box.delete();
  });
});
