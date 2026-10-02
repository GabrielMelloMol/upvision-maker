import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import opentype from "opentype.js";
import { beforeAll, describe, expect, test } from "vitest";
import { textToCrossSection } from "../text";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { checkModels } from "../../qa/checks";
import { volume } from "../testUtil";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { buildCakeStand, buildStickStand, DEFAULT_CAKE_STAND as B, DEFAULT_STICK_STAND as S, holeRings } from "./confectionery";
import { buildGridCutter, DEFAULT_GRID_CUTTER as G } from "./gridCutter";
import { buildOutlineBowl, DEFAULT_OUTLINE_BOWL as O } from "./outlineBowl";
import { buildGoalBoard, DEFAULT_GOAL_BOARD as GB, goalLabels } from "./goalBoard";
import { buildTextureRoller, DEFAULT_TEXTURE_ROLLER as TR, rollerGrid } from "./textureRoller";
import { buildScrewCase, caseLayout, DEFAULT_SCREW_CASE as SC, screwCaseClosed } from "./screwCase";
import { buildStampMold, DEFAULT_STAMP_MOLD as SM, moldDesign } from "./stampMold";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada letra é um retângulo 0,6h × h. */
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const size = (models: Model[]) => {
  const b = modelsBounds(models)!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};

/** Toda parte é um sólido fechado, com volume e apoiado na mesa (z ≥ 0). */
export function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const q of m.parts) {
      const s = solid(q.mesh);
      expect(s.status()).toBe("NoError");
      expect(volume(q.mesh)).toBeGreaterThan(0);
      expect(meshBounds([q.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-4);
      s.delete();
    }
}

describe("cortador em grade (#63)", { timeout: 30_000 }, () => {
  test("uma abertura por célula; tamanho = colunas × largura + lâmina; altura da lâmina", () => {
    const { models } = buildGridCutter(ctx(), { ...G, tabs: false });
    expectPrintable(models);
    const blade = solid(models[0].parts[0].mesh);
    expect(blade.genus()).toBe(G.rows * G.cols); // cada célula é um furo que atravessa
    const [w, h, z] = size(models);
    expect(w).toBeCloseTo(G.cols * G.cellWidth + G.wall + 2 * G.flangeWidth, 0);
    expect(h).toBeCloseTo(G.rows * G.cellHeight + G.wall + 2 * G.flangeWidth, 0);
    expect(z).toBeCloseTo(G.height, 1);
  });

  test("abas de pega com texto em relevo em outra cor, uma de cada lado", () => {
    const { models } = buildGridCutter(ctx(), G);
    expectPrintable(models);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Cortador", "Texto"]);
    const [w] = size(models);
    expect(w).toBeGreaterThan(G.cols * G.cellWidth + 2 * G.tabLength - 1);
    const text = meshBounds([models[0].parts[1].mesh])!;
    expect(text.min[2]).toBeCloseTo(G.flangeHeight, 3); // em cima da aba
  });

  test("grade maior que a mesa avisa", () => {
    const { warnings } = buildGridCutter(ctx(), { ...G, cols: 10, cellWidth: 30 });
    expect(warnings?.join()).toMatch(/mesa/);
  });

  test("texto da aba espremido no mínimo avisa que os traços somem (#90: a cor do texto não saía no fatiador)", () => {
    const b = readFileSync(resolve(__dirname, "../../assets/fonts/hanken-grotesk-800.ttf"));
    const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const real: ModelCtx = { ...ctx(), text: (s, h) => (s.trim() ? textToCrossSection(M, font, s, h) : null) };
    const tiny = { ...G, cellWidth: 10, cellHeight: 10, cols: 1, rows: 1, tabLength: 12 };
    expect(buildGridCutter(real, tiny).warnings?.join()).toMatch(/somem na impressão/);
    expect(buildGridCutter(real, G).warnings?.join() ?? "").not.toMatch(/somem/);
  });
});

describe("suporte de palitos (#65a)", { timeout: 30_000 }, () => {
  test("furos distribuídos em anéis, sem sobrar nem faltar; centro livre", () => {
    const rings = holeRings(12, 20);
    expect(rings.reduce((t, r) => t + r.count, 0)).toBe(12);
    for (const r of rings) expect((2 * Math.PI * r.radius) / r.count).toBeGreaterThanOrEqual(20 - 1e-6); // espaço entre furos
    expect(rings[0].radius).toBeGreaterThan(0);
  });

  test("maciço: um furo por palito (genus) e a altura pedida", () => {
    const { models } = buildStickStand(ctx(), { ...S, base: "solid" });
    expectPrintable(models);
    expect(size(models)[2]).toBeCloseTo(S.height, 1);
    expect(solid(models[0].parts[0].mesh).volume()).toBeGreaterThan(0);
  });

  test("leve (oco por baixo) gasta menos plástico; com peso ganha bolsão e tampa separada", () => {
    const vol = (base: "solid" | "light" | "weight") => volume(buildStickStand(ctx(), { ...S, base }).models[0].parts[0].mesh);
    expect(vol("light")).toBeLessThan(vol("solid") * 0.7);
    const weighted = buildStickStand(ctx(), { ...S, base: "weight" }).models;
    expectPrintable(weighted);
    expect(weighted.map((m) => m.name)).toEqual(["Suporte de palitos", "Tampa do peso"]);
    expect(vol("weight")).toBeLessThan(vol("solid"));
  });
});

describe("boleira (#65b)", { timeout: 30_000 }, () => {
  test("impressa de cabeça para baixo: prato na mesa, pé em cima; altura e diâmetro pedidos", () => {
    const { models } = buildCakeStand(ctx(), B);
    expectPrintable(models);
    const [w, , z] = size(models);
    expect(w).toBeCloseTo(B.diameter + 2 * B.waveDepth, 0);
    expect(z).toBeCloseTo(B.height, 1);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Boleira", "Nome"]);
    const name = meshBounds([models[0].parts[1].mesh])!;
    expect(name.min[2]).toBeCloseTo(0, 3); // nome embutido na face que fica na mesa (vira o topo do prato)
  });

  test("pé com rampa de no máximo 45° (sem suporte): pé largo demais para a altura é limitado e avisa", () => {
    const { warnings, models } = buildCakeStand(ctx(), { ...B, height: 40, footDiameter: 200 });
    expectPrintable(models);
    expect(warnings?.join()).toMatch(/pé/);
  });

  test("sem nome: uma peça só; prato maior que a mesa avisa", () => {
    expect(buildCakeStand(ctx(), { ...B, name: "" }).models[0].parts).toHaveLength(1);
    expect(buildCakeStand(ctx(), { ...B, diameter: 260 }).warnings?.join()).toMatch(/mesa/);
  });
});

describe("cumbuca no contorno (#66)", { timeout: 30_000 }, () => {
  const star = () => M.CrossSection.circle(30, 5); // pentágono como "desenho"
  const withArt = (): ModelCtx => ({ ...ctx(), art: star() });

  test("sem desenho: coração de exemplo; largura e altura pedidas; oca por dentro", () => {
    const { models } = buildOutlineBowl(ctx(), { ...O, floorArt: false });
    expectPrintable(models);
    const [w, , z] = size(models);
    expect(w).toBeCloseTo(O.width, 0);
    expect(z).toBeCloseTo(O.height, 1);
    const bowl = models[0].parts[0].mesh;
    expect(volume(bowl)).toBeLessThan(O.width * O.width * O.height * 0.35); // casca, não bloco
  });

  test("contorno do desenho enviado; fundo arredondado: a base é menor que a boca", () => {
    const { models } = buildOutlineBowl(withArt(), { ...O, floorArt: false, bottomRadius: 8 });
    expectPrintable(models);
    const s = solid(models[0].parts[0].mesh);
    const foot = s.trimByPlane([0, 0, -1], -0.2).boundingBox(); // o que está abaixo de 0,2 mm
    const all = s.boundingBox();
    expect(foot.max[0] - foot.min[0]).toBeLessThan(all.max[0] - all.min[0] - 8);
  });

  test("peça só apoiada na mesa, sem corpo solto no ar, no padrão e no máximo (#134)", () => {
    const MAX = { ...O, width: 240, height: 150, shell: 5, floor: 5, bottomRadius: 30, rimRadius: 2.5, floorArtScale: 0.8, relief: 3 };
    for (const p of [O, MAX]) {
      const fails = checkModels(M, buildOutlineBowl(ctx(), p).models).filter((x) => x.kind === "fail");
      expect(fails.map((f) => f.msg)).toEqual([]);
    }
  });

  test("desenho em relevo no fundo, em outra cor, apoiado no piso por dentro", () => {
    const { models } = buildOutlineBowl(withArt(), O);
    expectPrintable(models);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Cumbuca", "Desenho no fundo"]);
    const b = meshBounds([models[0].parts[1].mesh])!;
    expect(b.min[2]).toBeCloseTo(O.floor, 3);
    expect(b.max[2]).toBeCloseTo(O.floor + O.relief, 3);
  });
});

describe("molde para carimbo de EVA (#73)", { timeout: 30_000 }, () => {
  // dois quadrados de 20 mm separados por 3 mm
  const twoSquares = () => M.CrossSection.union([M.CrossSection.square([20, 20], true).translate([-11.5, 0]), M.CrossSection.square([20, 20], true).translate([11.5, 0])]);
  const withArt = (): ModelCtx => ({ ...ctx(), art: twoSquares() });

  test("desenho rebaixado na placa na profundidade pedida; placa = desenho + margem", () => {
    const { models } = buildStampMold(withArt(), { ...SM, thumb: false });
    expectPrintable(models);
    const [w, h, z] = size(models);
    expect(w).toBeCloseTo(SM.size + 2 * SM.margin, 0);
    expect(h).toBeCloseTo((20 / 43) * SM.size + 2 * SM.margin, 0);
    expect(z).toBeCloseTo(SM.thickness, 3);
    const full = w * h * SM.thickness;
    expect(full - volume(models[0].parts[0].mesh)).toBeGreaterThan(0.9 * 2 * (20 * SM.size / 43) ** 2 * SM.depth);
  });

  test("inverter: o desenho fica em relevo, mais alto que a placa", () => {
    const { models } = buildStampMold(withArt(), { ...SM, invert: true, thumb: false });
    expectPrintable(models);
    expect(size(models)[2]).toBeCloseTo(SM.thickness + SM.depth, 3);
  });

  test("offset liga partes soltas: com ponte maior que o vão, vira uma peça só", () => {
    const art = twoSquares();
    expect(moldDesign(art, 80, 0).decompose().length).toBe(2);
    expect(moldDesign(art, 80, 4).decompose().length).toBe(1); // vão de ~5,6 mm na escala 80
  });

  test("apoio de polegar: pino separado e encaixe cego no verso; sem desenho usa o texto", () => {
    const { models } = buildStampMold(ctx(), SM);
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["Molde", "Apoio de polegar"]);
    const plate = solid(models[0].parts[0].mesh);
    const socket = M.Manifold.cylinder(1, 3, 3).translate([SM.thumbX, SM.thumbY, 0.2]);
    expect(plate.intersect(socket).volume()).toBeLessThan(0.01); // furo no verso onde o pino entra
  });
});

describe("estojo com tampa de rosca (#59)", { timeout: 30_000 }, () => {
  const closed = (p = {}) => screwCaseClosed(ctx(), { ...SC, name: "", ...p });

  test("fechado: corpo e tampa não se atravessam e a rosca engata (crista do macho além do fundo da fêmea)", () => {
    const { body, lid } = closed();
    expect(body.intersect(lid).volume()).toBeLessThan(0.5);
    const L = caseLayout(SC);
    expect(L.maleMajor).toBeGreaterThan(L.femaleMinor + 0.5);
    expect(L.femaleMinor).toBeGreaterThan(L.maleMinor); // folga no fundo
    body.delete();
    lid.delete();
  });

  test("cabe o que foi pedido: cilindro de diâmetro e altura internos livre por dentro", () => {
    const { body, lid } = closed();
    const L = caseLayout(SC);
    const inside = M.Manifold.cylinder(SC.innerHeight - 0.1, SC.innerDiameter / 2 - 0.05, SC.innerDiameter / 2 - 0.05, 64).translate([0, 0, L.floor + 0.05]);
    expect(inside.intersect(body).volume() + inside.intersect(lid).volume()).toBeLessThan(0.5);
    body.delete();
    lid.delete();
  });

  test("tampa fechada fica rente ao corpo (mesmo diâmetro por fora)", () => {
    const { body, lid } = closed();
    const b = body.boundingBox(), l = lid.boundingBox();
    expect(l.max[0] - l.min[0]).toBeCloseTo(b.max[0] - b.min[0], 1);
    expect(l.min[2]).toBeCloseTo(caseLayout(SC).shoulder, 3); // encosta no ombro
  });

  test("para imprimir: corpo em pé e tampa de cabeça para baixo, lado a lado; nome em relevo em outra cor", () => {
    const { models } = buildScrewCase(ctx(), SC);
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["Corpo", "Tampa"]);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Corpo", "Nome"]);
    const lid = meshBounds(models[1].parts.map((p) => p.mesh))!;
    expect(lid.max[2] - lid.min[2]).toBeCloseTo(caseLayout(SC).lidHeight, 1);
    expect(modelsBounds([models[1]])!.min[0]).toBeGreaterThan(modelsBounds([models[0]])!.max[0]);
  });

  test("nome gravado tira plástico; orelha de chaveiro alarga a tampa; mosaico põe relevo em volta", () => {
    const vol = (p: object) => volume(buildScrewCase(ctx(), { ...SC, ...p }).models[0].parts[0].mesh);
    expect(vol({ nameMode: "engraved" })).toBeLessThan(vol({ nameMode: "none" }));
    const lidW = (p: object) => size([buildScrewCase(ctx(), { ...SC, ...p }).models[1]])[0];
    expect(lidW({ keyring: true })).toBeGreaterThan(lidW({ keyring: false }) + 5);
    const mosaic = buildScrewCase({ ...ctx(), art: M.CrossSection.circle(5, 6) }, { ...SC, nameMode: "none", texture: "mosaic" });
    expectPrintable(mosaic.models);
    expect(mosaic.models[0].parts.map((p) => p.name)).toEqual(["Corpo", "Textura"]);
  });
});

describe("rolo de textura (#64)", { timeout: 30_000 }, () => {
  test("grade sem costura: número inteiro de ladrilhos em volta, que fecham a circunferência exata", () => {
    const g = rollerGrid(40, 80, 12);
    expect(Number.isInteger(g.cols)).toBe(true);
    expect(g.cols * g.cellW).toBeCloseTo(Math.PI * 40, 6);
    expect(g.rows * g.cellH).toBeCloseTo(80, 6);
  });

  test("alto relevo: desenho para fora até o diâmetro pedido; eixo passante (1 furo)", () => {
    const { models } = buildTextureRoller(ctx(), { ...TR, relief: "high", ends: "axle" });
    expectPrintable(models);
    const [w, h, z] = size(models);
    expect(w).toBeCloseTo(TR.diameter, 0);
    expect(h).toBeCloseTo(TR.diameter, 0);
    expect(z).toBeCloseTo(TR.width, 1);
    const s = solid(models[0].parts[0].mesh);
    expect(s.genus()).toBeGreaterThanOrEqual(1); // o furo do eixo
    const core = Math.PI * ((TR.diameter / 2 - TR.depth) ** 2 - (TR.axleDiameter / 2) ** 2) * TR.width;
    expect(s.volume()).toBeGreaterThan(core); // o relevo soma por fora
  });

  test("baixo relevo: desenho rebaixado no cilindro; cabos nas pontas aumentam a altura", () => {
    const low = buildTextureRoller(ctx(), { ...TR, relief: "low", ends: "axle" }).models;
    expectPrintable(low);
    const full = Math.PI * ((TR.diameter / 2) ** 2 - (TR.axleDiameter / 2) ** 2) * TR.width;
    expect(volume(low[0].parts[0].mesh)).toBeLessThan(full - 1);
    const handles = buildTextureRoller(ctx(), { ...TR, ends: "handles" }).models;
    expectPrintable(handles);
    expect(size(handles)[2]).toBeCloseTo(TR.width + 2 * TR.handleLength, 1);
  });

  test("imagem envolvente: um desenho só esticado em volta", () => {
    const { models } = buildTextureRoller({ ...ctx(), art: M.CrossSection.square([30, 10], true) }, { ...TR, pattern: "wrap" });
    expectPrintable(models);
  });
});

describe("quadro de metas (#75)", { timeout: 30_000 }, () => {
  test("números do passo até a meta, com prefixo e sufixo; contagem regressiva inverte", () => {
    expect(goalLabels({ ...GB, target: 200, step: 50, prefix: "R$ ", suffix: "" }).labels).toEqual(["R$ 50", "R$ 100", "R$ 150", "R$ 200"]);
    expect(goalLabels({ ...GB, target: 3000, step: 1000, prefix: "", suffix: "K", countdown: true }).labels).toEqual(["3.000K", "2.000K", "1.000K"]);
    const many = goalLabels({ ...GB, target: 10000, step: 10 });
    expect(many.labels).toHaveLength(100);
    expect(many.clamped).toBe(true);
  });

  test("placa com a grade de números em relevo em outra cor, título e suporte de mesa", () => {
    const { models, warnings } = buildGoalBoard(ctx(), GB);
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["Quadro", "Suporte"]);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Placa", "Números e título"]);
    const [w] = size([models[0]]);
    expect(w).toBeCloseTo(GB.width, 0);
    expect(warnings).toEqual([]);
    const txt = meshBounds([models[0].parts[1].mesh])!;
    expect(txt.min[2]).toBeCloseTo(GB.thickness, 3);
  });

  test("mais de 100 números: usa os 100 primeiros e avisa", () => {
    expect(buildGoalBoard(ctx(), { ...GB, target: 10000, step: 10 }).warnings?.join()).toMatch(/100/);
  });
});
