import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { fitDepth } from "./cutPins";
import { regionOfKind, regionBox, type Region } from "./cutRegion";
import { splitIslands } from "./islands";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { DEFAULT_PARTIAL_CUT, planeNormal, partialCut, type PartialCutOptions } from "./partialCut";
import { modelVolume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const cube = (w: number, d: number, h: number, x = 0, y = 0, z = 0) => M.Manifold.cube([w, d, h]).translate([x, y, z]);

/** "Personagem + árvore": dois blocos de 20 × 20 × 40 lado a lado (x 0–20 e x 40–60), numa peça só. */
function scene(): Model {
  return { name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([cube(20, 20, 40), cube(20, 20, 40, 40)])) }] };
}
const BLOCK = 20 * 20 * 40;
const bounds = (m: Model) => meshBounds(m.parts.map((p) => p.mesh))!;
/** Só a região do personagem, dos 20 mm para cima. */
const HEAD: PartialCutOptions = { ...DEFAULT_PARTIAL_CUT, offset: 30, pin: "none", region: { kind: "box", min: [-5, -5, 20], max: [25, 25, 50] } };

describe("corte parcial: só dentro da caixa (#cortes)", () => {
  test("personagem + árvore: corta só o topo de um bloco e a árvore fica intacta", () => {
    const r = partialCut(M, scene(), HEAD);
    const [piece, rest] = [r.models.find((m) => m.name.endsWith("pedaço"))!, r.models.find((m) => m.name.endsWith("resto"))!];
    expect(modelVolume(piece)).toBeCloseTo(20 * 20 * 10, 1); // do plano (z = 30) até o topo (40)
    expect(modelVolume(rest)).toBeCloseTo(2 * BLOCK - 20 * 20 * 10, 1);
    // a árvore continua inteira e no lugar, dentro do resto
    const tree = solid(rest.parts[0].mesh).intersect(cube(20, 20, 40, 40));
    expect(tree.volume()).toBeCloseTo(BLOCK, 1);
    // o personagem perdeu o topo: o resto dele vai só até o plano
    const body = solid(rest.parts[0].mesh).intersect(cube(30, 30, 60, -5, -5));
    expect(body.boundingBox().max[2]).toBeCloseTo(30, 3);
  });

  test("a soma das duas peças volta ao original e as duas saem fechadas (manifold)", () => {
    const r = partialCut(M, scene(), HEAD);
    expect(r.report.original).toBeCloseTo(2 * BLOCK, 1);
    expect(r.report.sum).toBeCloseTo(r.report.original, 1);
    expect(r.report.ok).toBe(true);
    for (const m of r.models) for (const p of m.parts) expect(solid(p.mesh).status()).toBe("NoError");
  });

  test("o pedaço sai apoiado na face cortada (plana, na mesa) e o resto também na mesa, lado a lado", () => {
    const r = partialCut(M, scene(), HEAD);
    const [piece, rest] = [r.models[1], r.models[0]];
    expect(bounds(piece).min[2]).toBeCloseTo(0, 5);
    expect(bounds(rest).min[2]).toBeCloseTo(0, 5);
    // face cortada para baixo: o pedaço é um bloco de 10 mm de altura
    expect(bounds(piece).max[2]).toBeCloseTo(10, 3);
    expect(bounds(piece).min[0]).toBeGreaterThan(bounds(rest).max[0]);
  });

  test("a prévia é montada: pedaço no lugar (afastado só se pedir) + contorno da região e do plano", () => {
    const together = partialCut(M, scene(), HEAD).preview;
    expect(together.map((m) => m.name)).toEqual(expect.arrayContaining(["Resto", "Pedaço", "Região", "Plano de corte"]));
    const lift = (o: PartialCutOptions) => bounds(partialCut(M, scene(), o).preview.find((m) => m.name === "Pedaço")!).min[2];
    expect(lift(HEAD)).toBeCloseTo(30, 3);
    expect(lift({ ...HEAD, explode: 15 })).toBeCloseTo(45, 3);
  });

  test("caixa que não toca a peça ou plano fora da caixa: erro claro", () => {
    expect(() => partialCut(M, scene(), { ...HEAD, region: { kind: "box", min: [100, 100, 20], max: [120, 120, 50] } })).toThrow(/não passa/);
    expect(() => partialCut(M, scene(), { ...HEAD, offset: 55 })).toThrow(/não passa/);
  });

  test("sem caixa o corte vale na peça inteira (como o plano do fatiador)", () => {
    const r = partialCut(M, scene(), { ...HEAD, region: null });
    const piece = r.models.find((m) => m.name.endsWith("pedaço"))!;
    expect(modelVolume(piece)).toBeCloseTo(2 * 20 * 20 * 10, 1);
  });

  test("plano inclinado a 45°: soma igual ao original e o pedaço deita na face cortada", () => {
    const o: PartialCutOptions = { ...HEAD, tilt: 45, offset: 30 * Math.cos(Math.PI / 4) + 10 * Math.sin(Math.PI / 4), region: { kind: "box", min: [-5, -5, 0], max: [25, 25, 50] } };
    const r = partialCut(M, scene(), o);
    expect(r.report.sum).toBeCloseTo(r.report.original, 1);
    expect(r.report.ok).toBe(true);
    expect(bounds(r.models[1]).min[2]).toBeCloseTo(0, 5);
  });

  test("planeNormal: eixo e inclinação", () => {
    expect(planeNormal("z", 0)).toEqual([0, 0, 1]);
    const n = planeNormal("z", 90);
    expect(n[0]).toBeCloseTo(1, 6);
    expect(n[2]).toBeCloseTo(0, 6);
    const x = planeNormal("x", 0);
    expect(x).toEqual([1, 0, 0]);
  });
});

describe("corte parcial: encaixe na face cortada", () => {
  const PINS: PartialCutOptions = { ...HEAD, pin: "round", size: 6, clearance: 0.2 };

  test("pino solto: furo no pedaço e no resto, e o pino separado cabe no furo com folga", () => {
    const r = partialCut(M, scene(), PINS);
    const [rest, piece, pins] = r.models;
    expect(r.models).toHaveLength(3);
    expect(modelVolume(piece)).toBeLessThan(20 * 20 * 10 - 20);
    expect(modelVolume(rest)).toBeLessThan(2 * BLOCK - 20 * 20 * 10 - 20);
    expect(pins.name).toMatch(/pinos/);
    const pin = solid(pins.parts[0].mesh);
    // o pino (6 mm) entra no furo do pedaço: o furo começa na mesa (face cortada para baixo), no centro do corte (x 10, y 10)
    const hole = solid(piece.parts[0].mesh).intersect(M.Manifold.cylinder(pin.boundingBox().max[2] / 2, 3, 3, 48).translate([bounds(piece).min[0] + 10, 10, 0]));
    expect(hole.volume()).toBeCloseTo(0, 2);
    expect(r.report.ok).toBe(true); // a soma sem encaixe continua igual ao original
  });

  test("pino fixo: nasce no resto (sai do plano) e o pedaço recebe o furo", () => {
    const r = partialCut(M, scene(), { ...PINS, mode: "fixed" });
    expect(r.models).toHaveLength(2);
    const [rest, piece] = r.models;
    expect(modelVolume(piece)).toBeLessThan(20 * 20 * 10 - 20);
    const body = solid(rest.parts[0].mesh).intersect(cube(30, 30, 60, -5, -5));
    expect(body.boundingBox().max[2]).toBeGreaterThan(30 + 3); // o pino passa do plano
  });

  test("corte fino demais para o pino: sai sem encaixe e avisa", () => {
    const r = partialCut(M, scene(), { ...PINS, size: 18 });
    expect(r.models).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/pequena ou fina demais/);
  });
});

describe("corte parcial: região em cilindro e esfera", () => {
  const cut = (region: Region, extra: Partial<PartialCutOptions> = {}) => partialCut(M, scene(), { ...DEFAULT_PARTIAL_CUT, offset: 30, pin: "none", region, ...extra });
  const pieceOf = (r: ReturnType<typeof partialCut>) => r.models.find((m) => m.name.endsWith("pedaço"))!;
  const restOf = (r: ReturnType<typeof partialCut>) => r.models.find((m) => m.name.endsWith("resto"))!;
  const tree = (m: Model) => solid(m.parts[0].mesh).intersect(cube(20, 20, 40, 40)).volume();

  test("cilindro em volta do pescoço: só o que está dentro do raio sai, a árvore fica intacta", () => {
    const r = cut({ kind: "cylinder", center: [10, 10, 35], radius: 8, height: 30, axis: "z" });
    const disc = Math.PI * 64 * 0.9966; // 48 lados
    expect(modelVolume(pieceOf(r))).toBeCloseTo(disc * 10, -1);
    expect(tree(restOf(r))).toBeCloseTo(BLOCK, 1);
    expect(r.report.ok).toBe(true);
  });

  test("cilindro deitado (eixo X) vale na altura e na largura dele", () => {
    const r = cut({ kind: "cylinder", center: [10, 10, 35], radius: 6, height: 40, axis: "x" }, { offset: 32 });
    expect(modelVolume(pieceOf(r))).toBeGreaterThan(100);
    expect(r.report.ok).toBe(true);
    expect(tree(restOf(r))).toBeCloseTo(BLOCK, 1);
  });

  test("esfera: pega só a calota de cima e mantém a árvore", () => {
    const r = cut({ kind: "sphere", center: [10, 10, 33], radius: 6 });
    const v = modelVolume(pieceOf(r));
    expect(v).toBeGreaterThan(100);
    expect(v).toBeLessThan((4 / 3) * Math.PI * 216);
    expect(r.report.ok).toBe(true);
    expect(tree(restOf(r))).toBeCloseTo(BLOCK, 1);
  });

  test("a prévia mostra o contorno de cada forma", () => {
    for (const region of [regionOfKind("cylinder", { min: [0, 0, 20], max: [20, 20, 40] }), regionOfKind("sphere", { min: [0, 0, 20], max: [20, 20, 40] })]) {
      const r = cut(region);
      expect(r.preview.map((m) => m.name)).toContain("Região");
    }
  });

  test("regionBox e regionOfKind: trocar de forma mantém o lugar", () => {
    const b = { min: [0, 0, 20], max: [20, 20, 40] } as { min: [number, number, number]; max: [number, number, number] };
    expect(regionBox(regionOfKind("cylinder", b))).toEqual({ min: [0, 0, 20], max: [20, 20, 40] });
    expect(regionBox({ kind: "sphere", center: [5, 5, 5], radius: 2 }).max).toEqual([7, 7, 7]);
  });
});

describe("corte parcial: encaixe inteligente", () => {
  const slab = (w: number, d: number, h: number): Model => ({ name: "Peça", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(cube(w, d, h)) }] });
  const pinsOf = (m: Model[]) => m.find((x) => x.name.endsWith("pinos"));

  test("o tamanho vem do maior círculo da face: face de 20 mm leva pino de 12 mm (o máximo)", () => {
    const r = partialCut(M, slab(20, 20, 40), { ...DEFAULT_PARTIAL_CUT, offset: 20 });
    const b = meshBounds(pinsOf(r.models)!.parts.map((p) => p.mesh))!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(12, 0);
  });

  test("face pequena demais: sem pino e com aviso", () => {
    const r = partialCut(M, slab(5, 5, 40), { ...DEFAULT_PARTIAL_CUT, offset: 20 });
    expect(pinsOf(r.models)).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/pequena ou fina demais/);
  });

  test("face comprida ganha mais de um pino, todos dentro da face", () => {
    const r = partialCut(M, slab(70, 12, 30), { ...DEFAULT_PARTIAL_CUT, offset: 15 });
    expect(splitIslands(pinsOf(r.models)!.parts[0].mesh).length).toBeGreaterThanOrEqual(2);
  });

  test("o furo nunca passa da parede: numa ponta que afina, o pino fica mais curto", () => {
    const above = M.Manifold.cylinder(10, 5, 0.5, 32);
    const below = M.Manifold.cylinder(10, 5, 5, 32).translate([0, 0, -10]);
    const out = fitDepth(M, (o) => o, { shape: "round", size: 4, clearance: 0.2, want: 8 }, [[0, 0]], above, below);
    expect(out.depth).toBeLessThan(8);
    const flat = fitDepth(M, (o) => o, { shape: "round", size: 4, clearance: 0.2, want: 8 }, [[0, 0]], M.Manifold.cylinder(10, 5, 5, 32), below);
    expect(flat.depth).toBe(8);
  });
});
