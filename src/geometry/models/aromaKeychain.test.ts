import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { aromaCase, buildAroma, DEFAULT_AROMA, type AromaParams } from "./aromaKeychain";
import { caseOutlines } from "./caseShapes";
import { caseLayout, screwCaseClosed } from "./screwCase";
import { testArt } from "./sampleArt";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const aroma = (p: Partial<AromaParams> = {}, c = ctx()) => buildAroma(c, { ...DEFAULT_AROMA, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const part = (o: ReturnType<typeof aroma>, model: string, name: string) => o.models.find((m) => m.name === model)?.parts.find((x) => x.name === name);
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };

describe("chaveiro aromatizador: cápsula de rosca com feltro, furos e logo (#219)", { timeout: 60_000 }, () => {
  test("a rosca é a do Estojo: corpo e tampa fechados não se tocam, em várias folgas", () => {
    for (const clearance of [0.2, 0.35, 0.6]) {
      const { body, lid } = screwCaseClosed(ctx(), aromaCase({ ...DEFAULT_AROMA, clearance }));
      const both = body.intersect(lid);
      expect(both.volume(), `folga ${clearance}`).toBeLessThan(0.5);
      [body, lid, both].forEach((o) => o.delete());
    }
  });

  test("a cavidade cabe o feltro (Ø + 1 mm) e a altura dele com folga para o óleo", () => {
    const out = aroma({ feltDiameter: 30, feltThickness: 3 });
    const body = solid(part(out, "Corpo", "Corpo")!.mesh);
    // disco do feltro no fundo da cavidade (acima do piso): tudo vazio
    const felt = M.Manifold.cylinder(3, 15, 15, 64).translate([0, 0, DEFAULT_AROMA.floor + 0.01]);
    const hit = body.intersect(felt).volume();
    [body, felt].forEach((o) => o.delete());
    expect(hit).toBeLessThan(0.01);
  });

  test("furos de aroma: mais furos tiram mais material da tampa, e a tampa sai de pé na mesa", () => {
    const few = aroma({ holes: 4 });
    const many = aroma({ holes: 12 });
    expect(vol(part(many, "Tampa", "Tampa")!.mesh)).toBeLessThan(vol(part(few, "Tampa", "Tampa")!.mesh) - 1);
    const b = meshBounds([part(few, "Tampa", "Tampa")!.mesh])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
  });

  test("logo em relevo no meio da tampa (texto ou desenho), acima do teto, sem tapar os furos", () => {
    const withText = aroma();
    const logo = part(withText, "Tampa", "Logo")!;
    const lid = meshBounds([part(withText, "Tampa", "Tampa")!.mesh])!;
    const lb = meshBounds([logo.mesh])!;
    expect(lb.min[2]).toBeCloseTo(lid.max[2], 2); // apoiado no topo da tampa
    expect(lb.max[2] - lb.min[2]).toBeCloseTo(DEFAULT_AROMA.relief, 2);
    expect(part(aroma({}, ctx(testArt(M))), "Tampa", "Logo")).toBeDefined();
  });

  test("sem texto nem desenho não tem logo; o teste da rosca é só a rosca, pequena", () => {
    expect(part(aroma({ text: "" }), "Tampa", "Logo")).toBeUndefined();
    const full = aroma();
    const test = aroma({ print: "test" });
    expect(part(test, "Tampa", "Logo")).toBeUndefined();
    const size = (o: ReturnType<typeof aroma>) => { const b = meshBounds(o.models.flatMap((m) => m.parts.map((x) => x.mesh)))!; return b.max[0] - b.min[0]; };
    expect(size(test)).toBeLessThan(size(full) * 0.7);
  });

  test("olhal: o corpo ganha a orelha furada rente à mesa, só quando ligado", () => {
    const withEar = aroma({ keyring: true }), without = aroma({ keyring: false });
    const w = meshBounds([part(withEar, "Corpo", "Corpo")!.mesh])!, n = meshBounds([part(without, "Corpo", "Corpo")!.mesh])!;
    expect(w.max[0] - w.min[0]).toBeGreaterThan(n.max[0] - n.min[0] + 5);
    const s = solid(part(withEar, "Corpo", "Corpo")!.mesh);
    const hole = M.Manifold.cylinder(2, 0.5, 0.5, 8).translate([n.max[0] - 5 + 12 + 6, 0, 0.5]); // centro do furo do olhal
    expect(s.intersect(hole).volume()).toBeLessThan(0.01);
    [s, hole].forEach((o) => o.delete());
  });

  test("folga pequena avisa e furos que não cabem avisam", () => {
    expect(aroma({ clearance: 0.1 }).warnings?.join(" ")).toMatch(/Folga pequena/);
    expect(aroma({ feltDiameter: 8, holeDiameter: 4 }).warnings?.join(" ")).toMatch(/não cabem/);
    expect(aroma().warnings).toEqual([]);
  });

  describe.each(["round", "heart", "drop", "hex"] as const)("formato %s", (shape) => {
    test("o contorno guarda o círculo da rosca, o encaixe fechado não se toca e a peça sai inteira", () => {
      const L = caseLayout(aromaCase({ ...DEFAULT_AROMA, shape }));
      const o = caseOutlines(M, shape, L.outer, true);
      const circle = M.CrossSection.circle(L.outer - 0.01, 64);
      expect(circle.subtract(o.outline).area(), "círculo para fora do corpo").toBeLessThan(0.05);
      expect(circle.subtract(o.lidOutline).area(), "círculo para fora da tampa").toBeLessThan(0.05);
      [o.outline, o.lidOutline, circle].forEach((c) => c.delete());
      const out = aroma({ shape });
      expect(out.warnings).toEqual([]);
      const lid = solid(part(out, "Tampa", "Tampa")!.mesh);
      expect(lid.decompose().length).toBe(1);
      const body = solid(part(out, "Corpo", "Corpo")!.mesh);
      expect(body.decompose().length).toBe(1); // o olhal está preso ao corpo
      [lid, body].forEach((o2) => o2.delete());
    });
    test("tampa e corpo rosqueados não se tocam", () => {
      const sc = aromaCase({ ...DEFAULT_AROMA, shape });
      const L = caseLayout(sc);
      const o = caseOutlines(M, shape, L.outer, true);
      const { body, lid } = screwCaseClosed(ctx(), sc, { outline: o.outline, lidOutline: o.lidOutline, edge: "round", bevel: 0.9 });
      const both = body.intersect(lid);
      expect(both.volume()).toBeLessThan(0.5);
      [body, lid, both, o.outline, o.lidOutline].forEach((x) => x.delete());
    });
  });

  test("estrias: a tampa ganha material na borda que sem estrias; o corpo não muda", () => {
    const on = aroma({ knurl: true }), off = aroma({ knurl: false });
    const v = (o: ReturnType<typeof aroma>) => vol(part(o, "Tampa", "Tampa")!.mesh);
    expect(v(on)).toBeGreaterThan(v(off) + 5);
    expect(vol(part(on, "Corpo", "Corpo")!.mesh)).toBeCloseTo(vol(part(off, "Corpo", "Corpo")!.mesh), 1);
  });

  test("arestas arredondadas e chanfradas tiram material nas quinas; retas não", () => {
    const v = (edge: AromaParams["edge"]) => vol(part(aroma({ edge, knurl: false }), "Corpo", "Corpo")!.mesh);
    expect(v("round")).toBeLessThan(v("none") - 5);
    expect(v("chamfer")).toBeLessThan(v("none") - 5);
    expect(v("chamfer")).toBeLessThan(v("round")); // 45° tira mais que o quarto de círculo
  });

  test("montado: modelo só de prévia, com a tampa fechada no alto do corpo, centrado (a prévia alterna com a mesa)", () => {
    const out = aroma();
    const asm = out.models.find((m) => m.name === "Montado")!;
    expect(asm.previewOnly).toBe(true);
    expect(out.models.filter((m) => !m.previewOnly).map((m) => m.name)).toEqual(["Corpo", "Tampa"]);
    const ab = meshBounds(asm.parts.map((x) => x.mesh))!;
    const body = meshBounds([part(out, "Corpo", "Corpo")!.mesh])!;
    expect(ab.min[0]).toBeCloseTo(body.min[0], 1); // no mesmo lugar do corpo, não ao lado
    expect(ab.max[2]).toBeGreaterThan(body.max[2]); // a tampa fechada passa do topo do corpo aberto
    expect(out.models.find((m) => m.name === "Montado")!.parts.some((x) => x.name === "Logo")).toBe(true);
  });

  test("o logo padrão ocupa a área dentro do anel de furos", () => {
    const out = aroma({ text: "Sua marca" });
    const logo = meshBounds([part(out, "Tampa", "Logo")!.mesh])!;
    const lid = meshBounds([part(out, "Tampa", "Tampa")!.mesh])!;
    const w = logo.max[0] - logo.min[0];
    expect(w).toBeGreaterThan(20); // com 14 ficava num canto: agora preenche até a faixa dos furos
    expect(w).toBeLessThan(lid.max[0] - lid.min[0]);
  });

  test("logo de 2 cores: uma parte por cor, dentro da tampa", () => {
    const art = testArt(M);
    const half = art.intersect(M.CrossSection.square([200, 200], false).translate([0, -100]));
    const rest = art.subtract(half);
    const out = aroma({}, { ...ctx(art), artLayers: [{ color: "#ff0000", cs: half }, { color: "#0000ff", cs: rest }] });
    const logos = out.models[1].parts.filter((x) => x.name.startsWith("Logo"));
    expect(logos.map((x) => x.color).sort()).toEqual(["#0000ff", "#ff0000"]);
  });
});
