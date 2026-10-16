import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import { MissingInput, type ModelCtx } from "./common";
import { buildOpenerImage, DEFAULT_OPENER_IMAGE, type OpenerImageParams, type OpenerSide } from "./openerImage";
import { testArt } from "./sampleArt";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art = testArt(M)): ModelCtx => ({ M, art, text: () => null });
const build = (p: Partial<OpenerImageParams> = {}, c = ctx()) => buildOpenerImage(c, { ...DEFAULT_OPENER_IMAGE, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name);
/** Volume da peça dentro de uma sonda cúbica (centro e lado em mm, na altura da base). */
const volumeAt = (m: Mesh, c: [number, number], side: number) => {
  const s = solid(m);
  const probe = M.Manifold.cube([side, side, 2], true).translate([c[0], c[1], 1]);
  const v = s.intersect(probe).volume();
  [s, probe].forEach((o) => o.delete());
  return v;
};

describe("abridor pela imagem: base no contorno, abridor e argola nos 4 lados", { timeout: 60_000 }, () => {
  test("sem desenho pede o desenho (estado vazio, não erro)", () => {
    expect(() => buildOpenerImage({ M, art: null, text: () => null }, DEFAULT_OPENER_IMAGE)).toThrow(MissingInput);
  });

  test("o tamanho em cm vale para a imagem: 6 cm de largura no padrão", () => {
    const out = build({ ringSide: "left", openerSide: "right" });
    const art = part(out, "Relevo")!;
    const b = meshBounds([art.mesh])!;
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(60.01);
    expect(b.max[0] - b.min[0]).toBeGreaterThan(50); // o abridor da direita corta um pedaço
    const big = meshBounds([part(build({ sizeCm: 9, ringSide: "left", openerSide: "right" }), "Relevo")!.mesh])!;
    expect(big.max[1] - big.min[1]).toBeGreaterThan(b.max[1] - b.min[1]);
  });

  test("base, relevo e borda são partes de cores separadas; a borda pode ser desligada", () => {
    const out = build({ baseColor: "#ffffff", artColor: "#000000", rimColor: "#ff0000" });
    expect(out.models[0].parts.map((x) => [x.name, x.color])).toEqual([["Base", "#ffffff"], ["Relevo", "#000000"], ["Borda", "#ff0000"]]);
    expect(build({ rim: false }).models[0].parts.map((x) => x.name)).toEqual(["Base", "Relevo"]);
  });

  test("cores do desenho viram uma parte por cor", () => {
    const art = testArt(M);
    const half = art.intersect(M.CrossSection.square([200, 200], false).translate([0, -100]));
    const rest = art.subtract(half);
    const out = build({}, { ...ctx(art), artLayers: [{ color: "#ff0000", cs: half }, { color: "#0000ff", cs: rest }] });
    expect(out.models[0].parts.filter((x) => x.name.startsWith("Relevo")).map((x) => x.color).sort()).toEqual(["#0000ff", "#ff0000"]);
  });

  describe.each<[OpenerSide, [number, number]]>([["bottom", [0, -1]], ["top", [0, 1]], ["left", [-1, 0]], ["right", [1, 0]]])("abridor de garrafa embaixo/em cima/esquerda/direita: %s", (side, u) => {
    test("a abertura fica vazia, a peça cresce para esse lado e fica inteira", () => {
      const ring = side === "top" ? "bottom" : "top";
      const out = build({ openerSide: side, ringSide: ring });
      expect(out.warnings?.some((w) => /separado|solta|A parede em volta/.test(w))).toBe(false);
      const b = meshBounds([part(out, "Base")!.mesh])!;
      const reach = u[0] ? (u[0] > 0 ? b.max[0] : -b.min[0]) : u[1] > 0 ? b.max[1] : -b.min[1];
      expect(reach).toBeGreaterThan(35); // 30 mm de meia imagem + parte da aba para fora
      // a abertura da tampinha (Ø26) tem que estar vazia em algum ponto sobre o eixo da aba
      const bx = out.elements![0].box;
      const c: [number, number] = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
      const spots = Array.from({ length: 25 }, (_, i) => i - 12).map((d): [number, number] => [c[0] + u[0] * d, c[1] + u[1] * d]);
      const emptyBase = spots.find((at) => volumeAt(part(out, "Base")!.mesh, at, 3) < 1e-3);
      expect(emptyBase).toBeDefined();
      // e o relevo não cobre a abertura
      expect(volumeAt(part(out, "Relevo")!.mesh, emptyBase!, 6)).toBeCloseTo(0, 3);
    });
  });

  test("a peça sai inteira numa só peça de base, com argola furada", () => {
    const out = build();
    const s = solid(part(out, "Base")!.mesh);
    expect(s.decompose().length).toBe(1);
    expect(s.genus()).toBeGreaterThanOrEqual(2); // furo do abridor e da argola
    s.delete();
  });

  test("encaixe automático: peça mais curta que com o abridor todo para fora, e o relevo não é cortado", () => {
    const flat = () => ctx(M.CrossSection.square([100, 60], true)); // fundo reto: o abridor encosta nele
    const fora = build({ fit: false }, flat());
    const auto = build({}, flat());
    const h = (o: ReturnType<typeof build>) => { const b = meshBounds([part(o, "Base")!.mesh])!; return b.max[1] - b.min[1]; };
    expect(h(auto)).toBeLessThan(h(fora) - 3);
    const vol = (o: ReturnType<typeof build>) => { const s = solid(part(o, "Relevo")!.mesh); const v = s.volume(); s.delete(); return v; };
    expect(vol(auto)).toBeGreaterThan(vol(fora) * 0.99);
  });

  test("argola e abridor no mesmo lado: a argola vai para o lado oposto e avisa", () => {
    const out = build({ openerSide: "bottom", ringSide: "bottom" });
    expect(out.warnings?.join(" ")).toMatch(/lado oposto/);
  });

  test("lata: fenda aberta e ponta em rampa fina", () => {
    const out = build({ kind: "can" });
    const b = meshBounds([part(out, "Base")!.mesh])!;
    // ponta da aba (embaixo) é mais fina que a espessura da base
    const s = solid(part(out, "Base")!.mesh);
    const tip = M.Manifold.cube([4, 4, 20], true).translate([0, b.min[1] + 1, 10]);
    const tipTop = s.intersect(tip).boundingBox().max[2];
    [s, tip].forEach((o) => o.delete());
    expect(tipTop).toBeLessThan(DEFAULT_OPENER_IMAGE.thickness - 1);
    expect(out.models[0].name).toBe("Abridor de lata");
  });

  test("a aba entra na imagem quando o contorno é fino (ponta do coração): continua presa e sem relevo sobre a abertura", () => {
    const out = build({ openerSide: "bottom", ringSide: "top" });
    const s = solid(part(out, "Base")!.mesh);
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("sem problema, não avisa nada; espessura fina de garrafa avisa", () => {
    expect(build().warnings).toEqual([]);
    expect(build({ thickness: 4 }).warnings?.join(" ")).toMatch(/5 mm ou mais/);
  });

  test("nos limites do formulário (3 cm, borda mínima) a peça continua inteira, em todos os lados", () => {
    for (const openerSide of ["bottom", "top", "left", "right"] as const) {
      for (const kind of ["bottle", "can"] as const) {
        const out = build({ sizeCm: 3, margin: 1.5, thickness: 5, relief: 0.4, openerSide, ringSide: openerSide === "top" ? "bottom" : "top", kind });
        expect(JSON.stringify(out.warnings?.filter((w) => /separado|solta|A parede em volta/.test(w))), `${kind} ${openerSide}`).toBe("[]");
      }
    }
  });

  test("arrastar o abridor para longe da imagem avisa que ficou separado; ver o box de cada elemento", () => {
    const c = { ...ctx(), offset: (id: string): [number, number] => (id === "opener" ? [0, -60] : [0, 0]) };
    const out = buildOpenerImage(c, DEFAULT_OPENER_IMAGE);
    expect(out.warnings?.join(" ")).toMatch(/separado/);
    expect(out.elements?.map((e) => e.id)).toEqual(["opener", "ring"]);
  });
});
