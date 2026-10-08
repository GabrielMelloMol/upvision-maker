import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildShirtPrint, DEFAULT_SHIRT_PRINT as D, printThickness, type ShirtPrintParams } from "./shirtPrint";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "L" de 20 × 20 com o pé para a direita (barra vertical de 6 mm à esquerda). */
const ell = () => new M.CrossSection([[[0, 0], [20, 0], [20, 6], [6, 6], [6, 20], [0, 20]]], "NonZero");
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: ModelCtx["art"] = null, layers: ModelCtx["artLayers"] = null): ModelCtx => ({ M, art, artLayers: layers, text });
const build = (p: Partial<ShirtPrintParams> = {}, c: ModelCtx = ctx(ell())) => buildShirtPrint(c, { ...D, ...p });
const parts = (o: ReturnType<typeof build>) => o.models[0].parts;

describe("estampa de camisa (#187)", { timeout: 60_000 }, () => {
  test("espessura = camadas × altura da camada, apoiada na mesa, na largura pedida", () => {
    const b = meshBounds([parts(build({ mirror: false }))[0].mesh])!;
    expect(printThickness(D)).toBeCloseTo(0.3, 6);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(0.3, 3);
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.width, 1);
    expect(meshBounds([parts(build({ mirror: false, layers: 4, layerHeight: 0.1 }))[0].mesh])!.max[2]).toBeCloseTo(0.4, 3);
  });

  test("espelhada: o pé do L troca de lado (o centro de massa vai para o lado oposto); sem espelho, não", () => {
    const side = (mirror: boolean) => {
      const m = parts(build({ mirror }))[0].mesh;
      const b = meshBounds([m])!;
      // o pé (barra de baixo) fica à direita no desenho original: o volume da metade direita é maior
      const mid = (b.min[0] + b.max[0]) / 2;
      let left = 0, right = 0;
      for (let i = 0; i < m.indices.length; i += 3) {
        const cx = [0, 1, 2].reduce((s, k) => s + m.positions[m.indices[i + k] * 3], 0) / 3;
        if (cx < mid) left++;
        else right++;
      }
      return right - left;
    };
    expect(Math.sign(side(false))).toBe(-Math.sign(side(true)));
  });

  test("a espelhada tem o mesmo tamanho e volume da normal", () => {
    const a = parts(build({ mirror: false }))[0].mesh, b = parts(build({ mirror: true }))[0].mesh;
    expect(volume(b)).toBeCloseTo(volume(a), 3);
    const [ba, bb] = [meshBounds([a])!, meshBounds([b])!];
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(ba.max[0] - ba.min[0], 3);
  });

  test("texto sem desenho vira estampa; sem nada, pede dados", () => {
    expect(parts(build({ text: "Ana" }, ctx()))[0].name).toBe("Estampa");
    expect(() => build({ text: "" }, ctx())).toThrow(MissingInput);
  });

  test("desenho colorido: uma parte por cor, espelhadas juntas", () => {
    const left = new M.CrossSection([[[0, 0], [10, 0], [10, 20], [0, 20]]], "NonZero");
    const right = new M.CrossSection([[[10, 0], [20, 0], [20, 20], [10, 20]]], "NonZero");
    const art = new M.CrossSection([[[0, 0], [20, 0], [20, 20], [0, 20]]], "NonZero");
    const ps = parts(build({ width: 40 }, ctx(art, [{ color: "#ff0000", cs: left }, { color: "#0000ff", cs: right }])));
    expect(ps.map((x) => x.color)).toEqual(["#ff0000", "#0000ff"]);
    // espelhado: a parte vermelha (esquerda no original) agora fica à direita
    expect(meshBounds([ps[0].mesh])!.min[0]).toBeGreaterThan(meshBounds([ps[1].mesh])!.min[0]);
  });

  test("com fundo: adesivo contínuo, o fundo preenche em volta sem sobrepor a arte (mesma espessura)", () => {
    const ps = parts(build({ patch: true, margin: 4, mirror: false }));
    expect(ps.map((x) => x.name)).toEqual(["Estampa", "Fundo"]);
    const b = meshBounds(ps.map((x) => x.mesh))!;
    expect(b.max[2]).toBeCloseTo(0.3, 3);
    const art = meshBounds([ps[0].mesh])!, all = b;
    expect(all.max[0] - all.min[0]).toBeGreaterThan(art.max[0] - art.min[0] + 7); // 4 mm de cada lado
    // sem sobreposição: a arte e o fundo não dividem volume
    const solid = (m: (typeof ps)[number]["mesh"]) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
    const [a, f] = [solid(ps[0].mesh), solid(ps[1].mesh)];
    const both = a.intersect(f);
    expect(both.volume()).toBeLessThan(1e-3);
    [a, f, both].forEach((x) => x.delete());
  });

  test("avisos: traço fino, pedaços soltos sem fundo, estampa grossa", () => {
    const thin = M.CrossSection.square([20, 0.3], true);
    expect(build({ width: 20 }, ctx(thin)).warnings!.join(" ")).toMatch(/traço mais fino que 0,8 mm/);
    const dots = M.CrossSection.union([M.CrossSection.circle(1, 24), M.CrossSection.circle(1, 24).translate([20, 0])]);
    expect(build({ width: 21 }, ctx(dots)).warnings!.join(" ")).toMatch(/2 pedaço\(s\) pequeno\(s\)/);
    expect(build({ width: 21, patch: true }, ctx(dots)).warnings!.join(" ")).not.toMatch(/pedaço/);
    expect(build({ layers: 4, layerHeight: 0.2 }).warnings!.join(" ")).toMatch(/Estampa grossa/);
    expect(build().warnings!.join(" ")).not.toMatch(/grossa|traço mais fino|pedaço/);
    expect(build().warnings!.join(" ")).toMatch(/sai espelhada.*ferro de passar|ferro de passar/s);
    expect(build({ mirror: false }).warnings!.join(" ")).toMatch(/Sem espelhar/);
  });
});
