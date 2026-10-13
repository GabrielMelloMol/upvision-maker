import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { DEFAULT_PARTIAL_CUT } from "./partialCut";
import { runCuts, type CutItem } from "./cutSequence";
import { read3mf } from "./threemfRead";
import { filamentPlan, write3mf } from "./threemf";
import { modelVolume } from "./testUtil";
import type { Mesh, Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const cube = (w: number, d: number, h: number, x = 0) => M.Manifold.cube([w, d, h]).translate([x, 0, 0]);
const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const scene = (): Model => ({ name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([cube(20, 20, 40), cube(20, 20, 40, 40)])) }] });
const cut = (x0: number, x1: number, color: string | null = null): CutItem => ({ ...DEFAULT_PARTIAL_CUT, offset: 30, pin: "none", region: { kind: "box", min: [x0, -5, 20], max: [x1, 25, 50] }, color });

describe("vários cortes no mesmo arquivo", () => {
  test("dois cortes: um pedaço de cada bloco, o resto sem os dois topos e a soma volta ao original", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25), cut(35, 65)], restColor: null });
    expect(r.models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço 1", "Cena · pedaço 2"]);
    expect(modelVolume(r.models[1])).toBeCloseTo(4000, 1);
    expect(modelVolume(r.models[2])).toBeCloseTo(4000, 1);
    expect(modelVolume(r.models[0])).toBeCloseTo(2 * 16000 - 8000, 1);
    expect(r.report.ok).toBe(true);
    expect(r.report.sum).toBeCloseTo(r.report.original, 1);
  });

  test("um corte só mantém os nomes simples; sem peça acima do plano o erro cita o número do corte", () => {
    expect(runCuts(M, scene(), { cuts: [cut(-5, 25)], restColor: null }).models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço"]);
    expect(() => runCuts(M, scene(), { cuts: [cut(-5, 25), cut(-5, 25)], restColor: null })).toThrow(/Corte 2:/);
  });

  test("com pino, cada corte gera o seu pino", () => {
    const withPins = (c: CutItem): CutItem => ({ ...c, pin: "round" });
    const r = runCuts(M, scene(), { cuts: [withPins(cut(-5, 25)), withPins(cut(35, 65))], restColor: null });
    expect(r.models.map((m) => m.name)).toEqual(["Cena · resto", "Cena · pedaço 1", "Cena · pedaço 2", "Cena · pinos 1", "Cena · pinos 2"]);
    expect(r.report.ok).toBe(true);
  });

  test("o segundo corte vale no que sobrou: a árvore intacta no resto do corte 1", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25)], restColor: null });
    expect(solid(r.models[0].parts[0].mesh).intersect(cube(20, 20, 40, 40)).volume()).toBeCloseTo(16000, 1);
  });
});

describe("cor por pedaço no 3MF", () => {
  const colors = { a: "#e11d48", b: "#2563eb", rest: "#16a34a" };
  test("cada objeto sai na cor escolhida e o 3MF lido de volta tem um extrusor por cor", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25, colors.a), cut(35, 65, colors.b)], restColor: colors.rest });
    expect(r.models.map((m) => m.parts[0].color)).toEqual([colors.rest, colors.a, colors.b]);
    const file = read3mf(write3mf(r.models, {}));
    const byObject = file.objects.map((o) => o.parts[0].extruder);
    expect(new Set(byObject).size).toBe(3);
    expect(filamentPlan(r.models).filamentColors.map((c) => c.toLowerCase())).toEqual(expect.arrayContaining(Object.values(colors)));
  });

  test("a prévia mostra cada peça na cor que vai para o arquivo; o plano e a região usam cores de interface", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25, colors.a), cut(35, 65)], restColor: colors.rest });
    const byName = (n: string) => r.preview.find((m) => m.name === n)!;
    expect(byName("Resto").parts[0].color).toBe(colors.rest);
    expect(byName("Pedaço 1").parts[0].color).toBe(colors.a);
    expect(byName("Pedaço 2").parts[0].color).toBe("#d4d4d8"); // sem escolha: a cor do arquivo
    const plane = r.preview.filter((m) => m.name === "Plano de corte")[0].parts;
    expect(plane[0].ghost).toBe(true); // translúcido
    expect(plane[1]).toMatchObject({ name: "", ghost: false }); // contorno, fora da legenda
    const filament = [colors.a, colors.b, colors.rest, "#d4d4d8"];
    for (const m of r.preview.filter((x) => x.name === "Plano de corte" || x.name === "Região")) for (const p of m.parts) expect(filament).not.toContain(p.color);
    expect(r.preview.find((m) => m.name === "Região")!.parts[0].color).toBe("#3b82f6");
  });

  test("sem cor escolhida o pedaço sai com a cor do arquivo", () => {
    const r = runCuts(M, scene(), { cuts: [cut(-5, 25), cut(35, 65)], restColor: null });
    expect(r.models[1].parts[0].color).toBe("#d4d4d8");
  });
});

describe("encaixe que não coube: saídas na hora", () => {
  const thin = (): Model => ({ name: "Haste", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.cube([7, 7, 30])) }] });
  const at = (pin: CutItem["pin"], size: number): CutItem => ({ ...DEFAULT_PARTIAL_CUT, offset: 15, region: null, pin, size, color: null });

  test("face de 7 mm: o pino automático não cabe, mas há um pino fixo menor que cabe (e funciona)", () => {
    const r = runCuts(M, thin(), { cuts: [{ ...at("round", 0), size: 8 }], restColor: null });
    expect(r.pinIssues).toHaveLength(1);
    expect(r.pinIssues[0].cut).toBe(0);
    const fix = r.pinIssues[0].fixSize;
    expect(fix).not.toBeNull();
    const fixed = runCuts(M, thin(), { cuts: [{ ...at("round", fix!), mode: "fixed" }], restColor: null });
    expect(fixed.pinIssues).toHaveLength(0);
    expect(fixed.report.ok).toBe(true);
  });

  test("sem encaixe pedido não há problema a resolver", () => {
    expect(runCuts(M, thin(), { cuts: [at("none", 0)], restColor: null }).pinIssues).toHaveLength(0);
  });
});

describe("malha suja", () => {
  const dirty = (): Model => {
    const m = toMesh(M.Manifold.cube([20, 20, 20]));
    const keep: number[] = [];
    for (let t = 0; t < m.indices.length / 3; t++) if (t !== 5) keep.push(m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]);
    return { name: "Suja", parts: [{ name: "Peça", color: "#d4d4d8", mesh: { positions: m.positions, indices: Uint32Array.from(keep) } }] };
  };
  const plan = { cuts: [{ ...DEFAULT_PARTIAL_CUT, offset: 10, pin: "none" as const, region: null, color: null }], restColor: null };

  test("furo na malha: repara, corta e avisa", () => {
    const r = runCuts(M, dirty(), plan);
    expect(r.warnings.join(" ")).toMatch(/tinha 1 furo e foi reparada/);
    expect(r.models).toHaveLength(2);
    expect(r.report.ok).toBe(true);
  });

  test("lixo que não dá para reparar: erro claro em vez de peça vazia", () => {
    const junk: Model = { name: "Lixo", parts: [{ name: "Peça", color: "#fff", mesh: { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]) } }] };
    // um triângulo só: o leque fecha o furo e vira um sólido achatado de volume zero, que o Manifold recusa
    expect(() => runCuts(M, junk, plan)).toThrow(/não deu para reparar|não passa/);
  });
});
