import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { textToCrossSection } from "../text";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildAnatomicTray, utensilOf, utensilOutline } from "./cutleryAnatomic";
import { cutleryPlan } from "./cutleryPlan";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  const b = readFileSync(resolve(__dirname, "../../assets/fonts", "anton-400.ttf"));
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  ctx = { M, art: null, artLayers: null, text: (s, h) => textToCrossSection(M, font, s, h) };
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("bandeja de talheres anatômica (#214)", { timeout: 60_000 }, () => {
  test("reconhece o talher pelo nome da divisão (colherzinha antes de colher)", () => {
    expect(utensilOf("Colherzinha")).toBe("teaspoon");
    expect(utensilOf("Colher")).toBe("spoon");
    expect(utensilOf("Garfo")).toBe("fork");
    expect(utensilOf("FACA")).toBe("knife");
    expect(utensilOf("Utensílios 1")).toBeNull();
  });

  test.each(["spoon", "teaspoon", "fork", "knife"] as const)("contorno de %s: uma peça só, cabo para a frente e cabeça para trás, com a folga do talher", (kind) => {
    const cs = utensilOutline(M, kind);
    expect(cs.decompose()).toHaveLength(1);
    const b = cs.bounds();
    expect(b.min[1]).toBeLessThanOrEqual(-2.9); // folga de 3 mm na frente
    expect(b.max[1] - b.min[1]).toBeGreaterThan(140);
    // a cabeça (atrás) é mais larga que o cabo (frente), exceto a faca, em que o cabo é o mais largo
    const front = cs.intersect(M.CrossSection.square([1e3, 20], true).translate([0, 20])).bounds();
    const back = cs.intersect(M.CrossSection.square([1e3, 20], true).translate([0, b.max[1] - 20])).bounds();
    if (kind !== "knife") expect(back.max[0] - back.min[0]).toBeGreaterThan(front.max[0] - front.min[0]);
    cs.delete();
  });

  test("bandeja: medida do plano, fundo cheio, parede de cada cápsula e nomes em relevo numa segunda cor", () => {
    const plan = cutleryPlan({ width: 500, depth: 500, height: 110 });
    const t = plan.trays[0];
    const m = buildAnatomicTray(ctx, t, plan.trayDepth, plan.trayHeight, "#2563eb", "#f8f8f6");
    const b = meshBounds([m.parts[0].mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(t.width, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(plan.trayDepth, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(plan.trayHeight, 1);
    const s = solid(m.parts[0].mesh);
    expect(s.status()).toBe("NoError");
    expect(s.slice(0.5).area()).toBeGreaterThan(0.95 * t.width * plan.trayDepth); // fundo cheio
    // a meia altura só há paredes: bem menos material que uma bandeja de caixas
    expect(s.slice(plan.trayHeight / 2).area()).toBeLessThan(0.5 * t.width * plan.trayDepth);
    expect(m.parts.map((p) => p.name)).toEqual(["Bandeja", "Nomes"]);
    const names = solid(m.parts[1].mesh);
    expect(names.status()).toBe("NoError");
    const nb = names.boundingBox();
    expect(nb.min[2]).toBeGreaterThanOrEqual(1.9);
    expect(nb.max[2]).toBeLessThan(2.7); // 0,6 mm de relevo sobre o fundo de 2
    // os nomes ficam dentro da bandeja
    expect(nb.min[0]).toBeGreaterThan(0);
    expect(nb.max[0]).toBeLessThan(t.width);
    s.delete();
    names.delete();
  });

  test("a alça em meia-lua corta o topo das paredes da frente e de trás", () => {
    const plan = cutleryPlan({ width: 500, depth: 500, height: 110 });
    const m = buildAnatomicTray(ctx, plan.trays[0], plan.trayDepth, plan.trayHeight, "#2563eb", "#f8f8f6");
    const s = solid(m.parts[0].mesh);
    expect(s.slice(plan.trayHeight - 0.5).area()).toBeLessThan(s.slice(plan.trayHeight - 15).area());
    s.delete();
  });

  test("divisão que não é talher continua caixa retangular, sem nome", () => {
    const m = buildAnatomicTray(ctx, { width: 180, lanes: [{ label: "Utensílios 1", width: 90 }, { label: "Utensílios 2", width: 90 }] }, 250, 45, "#2563eb", "#f8f8f6");
    expect(m.parts.map((p) => p.name)).toEqual(["Bandeja"]);
  });
});
