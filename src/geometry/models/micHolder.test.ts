import { beforeAll, describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import { write3mf } from "../threemf";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { BAR_T, BORE, BOTTOM_WALL, buildMicHolder, DEFAULT_MIC_HOLDER, DIMPLE, FOAM_DEPTH, FRONT_WALL, HANDLE_RECESS, MIC_SHAPES, MIC_SHAPE_WIDTH, MIC_WALL, micLayout, PEG_D, PEG_H, PEG_L, RING_D, RING_H, SLOT_L, TENON_FIT, type MicHolderParams } from "./micHolder";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (art = false): ModelCtx => ({ M, art: art ? M.CrossSection.circle(20, 32) : null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<MicHolderParams> = {}, art = false) => buildMicHolder(ctx(art), { ...DEFAULT_MIC_HOLDER, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const byName = (ms: Model[], n: string) => ms.find((m) => m.name === n)!;
const P = DEFAULT_MIC_HOLDER;
type Out = ReturnType<typeof build>;
const view = (o: Out, id: string) => o.views!.find((v) => v.id === id)!.models;
/** A caixinha montada, como na vista "Montada": x = largura, +y = para trás, z = altura. */
const body = (o: Out) => solid(byName(view(o, "closed"), "Caixinha").parts[0].mesh);
/** A caixinha como vai para a mesa: costas em z = 0, frente em z = T. */
const printedBox = (o: Out) => solid(byName(o.models, "Caixinha").parts[0].mesh);
/** Caixa de x0..x1, y0..y1, z0..z1. */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
const full = (s: Solid, probe: Solid) => expect(s.intersect(probe).volume()).toBeCloseTo(probe.volume(), 1);
const empty = (s: Solid, probe: Solid, why?: string) => expect(s.intersect(probe).volume(), why).toBeLessThan(0.01);
/** Onde fica o bolso na peça montada: fundo (frente) e boca (costas) em y, chão em z. */
function pocketAt(o: Out, p: MicHolderParams) {
  const L = micLayout(p);
  const T = o.layout!.thickness;
  return { L, T, yFront: T / 2 - o.layout!.depth, yBack: T / 2, zFloor: o.layout!.cy - L.ch / 2 };
}
/** O transmissor (bloco do tamanho da ficha) deitado no bolso, encostado na frente; `grow` engorda, `back` estica para trás (o caminho de saída). */
function tx(o: Out, p: MicHolderParams, grow = 0, back = 0): Solid {
  const { yFront, zFloor } = pocketAt(o, p);
  const [y0, z0] = [yFront + p.clearance, zFloor + p.clearance];
  const r = p.micRound ? Math.min(p.micW, p.micH) / 2 + grow : 0;
  const block = box(-p.micW / 2 - grow, p.micW / 2 + grow, y0 + (p.micRound ? p.micH / 2 : -grow), y0 + p.micH + grow + back, z0 - grow, z0 + p.micT + grow);
  // microfone redondo: a frente dele é meia-volta, como a do bolso
  return p.micRound ? block.add(M.Manifold.cylinder(p.micT + 2 * grow, r, r, 64).translate([0, y0 + p.micH / 2, z0 - grow])) : block;
}

describe("canopla de microfone (#274, #293)", { timeout: 120_000 }, () => {
  test("o Lark M2 cabe deitado no bolso com a folga e sem encostar; um microfone maior que a folga bate na parede", () => {
    const o = build();
    empty(body(o), tx(o, P));
    expect(body(o).intersect(tx(o, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
  });

  test("caixinha numa peça só, sem pinos nem metades; duas mesas como a referência", () => {
    for (const head of ["foam", "grille"] as const) {
      const o = build({ head });
      expect(o.models.filter((m) => m.plate === 1).map((m) => m.name)).toEqual(["Caixinha"]);
      expect(o.models.filter((m) => m.plate === 2).map((m) => m.name)).toEqual(["Bolinha", "Anel", "Cabo", "Pecinha"]);
      expect(byName(o.models, "Caixinha").parts.map((p) => p.color)).toEqual([P.bodyColor, P.artColor]);
      expect(byName(o.models, "Anel").parts[0].color).toBe(P.ringColor); // cores separadas: anel prata
      expect(byName(o.models, "Bolinha").parts[0].color).toBe(P.headColor);
      expect(printedBox(o).genus()).toBe(0); // um sólido só, sem furo de pino
    }
    expect(build({ head: "bought" }).models.map((m) => [m.name, m.plate])).toEqual([["Caixinha", 1], ["Cabo", 2]]);
    // a mesa 2 fica ao lado da 1 (sem sobrepor) e o 3MF leva as duas mesas do Bambu Studio / OrcaSlicer
    const o = build();
    const [b1, b2] = [1, 2].map((n) => meshBounds(o.models.filter((m) => m.plate === n).flatMap((m) => m.parts.map((p) => p.mesh)))!);
    expect(b2.min[0]).toBeGreaterThan(b1.max[0]);
    const cfg = strFromU8(unzipSync(write3mf(o.models))["Metadata/model_settings.config"]);
    expect(cfg.match(/<plate>/g)).toHaveLength(2);
    expect(view(o, "bed").filter((m) => m.name.startsWith("Placa"))).toHaveLength(2);
  });

  test("fechada em 5 faces e aberta só atrás: frente, laterais, fundo e topo inteiros em volta da abertura", () => {
    const o = build();
    const b = body(o);
    const { L, T, yFront, yBack, zFloor } = pocketAt(o, P);
    expect(yFront + T / 2).toBeCloseTo(FRONT_WALL, 5); // o bolso vai até a parede da frente (2,2 mm, como a referência)
    const zTop = zFloor + L.ch;
    full(b, box(-L.cw / 2, L.cw / 2, -T / 2 + 0.05, yFront - 0.05, zFloor, zTop)); // frente
    full(b, box(-L.cw / 2, L.cw / 2, yFront, yBack - 0.05, PEG_H + 0.05, zFloor - 0.05)); // fundo (fora do rebaixo do cabo)
    const top = o.layout!.top;
    full(b, box(-L.cw / 2, L.cw / 2, yFront, yBack - 0.05, zTop + 0.05, top - PEG_H - 0.05)); // topo
    for (const sx of [-1, 1]) full(b, box(sx > 0 ? L.cw / 2 + 0.05 : -L.cw / 2 - MIC_WALL + 0.05, sx > 0 ? L.cw / 2 + MIC_WALL - 0.05 : -L.cw / 2 - 0.05, -T / 2 + 0.05, yBack - 0.05, zFloor, zTop)); // lados
    expect(zFloor).toBeCloseTo(BOTTOM_WALL, 5);
  });

  test("impressa deitada sem suporte: costas na mesa, logo em cima e o teto da cavidade fecha em ponte curta", () => {
    const o = build();
    const { L, T } = pocketAt(o, P);
    const depth = o.layout!.depth;
    for (const m of o.models) for (const part of m.parts) expect(meshBounds([part.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-6);
    const relief = byName(o.models, "Caixinha").parts[1];
    expect(meshBounds([relief.mesh])!.min[2]).toBeCloseTo(T, 3); // o logo na face de cima (a frente)
    // cavidade camada a camada (z da impressão): cada pedaço tem no máximo a altura do bolso em y (a ponte vai de uma parede
    // à outra) e, com o microfone redondo, ela vai fechando até o teto (a frente em meia-volta, como a referência)
    const cy = o.layout!.cy;
    const hull = box(-L.cw / 2 - 1, L.cw / 2 + 1, cy - L.ch / 2 - 0.5, cy + L.ch / 2 + 0.5, 0, T);
    const cavity = hull.subtract(printedBox(o));
    const at = (z: number) => cavity.slice(z);
    for (const z of [depth * SLOT_L + 0.5, depth - 3, depth - 0.3]) for (const poly of at(z).toPolygons()) {
      const ys = poly.map((q) => q[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(L.cd + 0.01);
    }
    expect(at(depth - 0.3).area()).toBeLessThan(at(depth * SLOT_L + 0.5).area() * 0.3);
    expect(at(depth + 0.1).area()).toBeLessThan(0.01); // acima disso, a parede da frente
  });

  test("encaixes da referência: pecinha no rebaixo de cima, anel por fora dela, bolinha sobre o anel e cabo no rebaixo de baixo", () => {
    for (const head of ["foam", "grille"] as const) {
      const o = build({ head });
      const L = micLayout(P);
      const top = o.layout!.top;
      const b = body(o);
      // rebaixos: Ø11,6 em cima e Ø15 embaixo, rasos (cola), e a pecinha e o cabo com a folga do encaixe
      empty(b, M.Manifold.cylinder(PEG_H - 0.05, PEG_D / 2 - 0.05, PEG_D / 2 - 0.05, 48).translate([0, 0, top - PEG_H + 0.02]));
      empty(b, M.Manifold.cylinder(PEG_H - 0.05, HANDLE_RECESS / 2 - 0.05, HANDLE_RECESS / 2 - 0.05, 48).translate([0, 0, 0.02]));
      expect(L.peg).toBeCloseTo(PEG_D - 2 * TENON_FIT);
      expect(L.handleD).toBeCloseTo(HANDLE_RECESS - 2 * TENON_FIT);
      const v = view(o, "closed");
      const parts = ["Pecinha", "Anel", "Bolinha", "Cabo"].map((n) => solid(byName(v, n).parts[0].mesh));
      for (const s of parts) empty(b, s, "nada entra na caixinha além dos rebaixos");
      empty(parts[0], parts[1], "o anel passa pela pecinha");
      empty(parts[0], parts[2], "a pecinha entra no furo da bolinha");
      expect(meshBounds([byName(v, "Bolinha").parts[0].mesh])!.min[2]).toBeCloseTo(top + RING_H, 3);
      expect(PEG_L - PEG_H - RING_H).toBeLessThan(BORE[head]); // a pecinha não bate no fundo do furo
      expect(meshBounds([byName(v, "Anel").parts[0].mesh])!.max[0] * 2).toBeCloseTo(RING_D, 1);
    }
  });

  test("bolinhas em pé sem suporte (no máximo 45°) e a grade com furinhos que um bico de 0,4 faz", () => {
    for (const head of ["foam", "grille"] as const) {
      const s = solid(byName(build({ head }).models, "Bolinha").parts[0].mesh);
      let prev = Infinity;
      for (let z = 0.2; z < (head === "foam" ? 32 : 24); z += 0.4) {
        const r = s.slice(z).bounds().max[0];
        if (prev !== Infinity) expect(r - prev, `${head} z=${z.toFixed(1)}`).toBeLessThanOrEqual(0.4 + 0.15);
        prev = r;
      }
    }
    expect(DIMPLE.d).toBeGreaterThanOrEqual(4 * 0.4); // furinho de 4 linhas
    expect(DIMPLE.pitch - DIMPLE.d).toBeGreaterThanOrEqual(2 * 0.4 - 1e-9); // parede entre eles de 2 linhas
    const grille = solid(byName(build({ head: "grille" }).models, "Bolinha").parts[0].mesh);
    expect(grille.genus()).toBe(0); // furinhos rasos: a casca continua fechada
    expect(grille.volume()).toBeGreaterThan(6500); // maciça como a da referência (7,4 cm³)
  });

  test("espuma comprada: furo no topo, que dá na janela do clipe, e nada acima do corpo", () => {
    const o = build({ head: "bought" });
    const b = body(o);
    const top = o.layout!.top;
    empty(b, M.Manifold.cylinder(FOAM_DEPTH - 0.1, P.neckD / 2 - 0.1, P.neckD / 2 - 0.1, 48).translate([0, 0, top - FOAM_DEPTH + 0.05]));
    expect(meshBounds([byName(view(o, "closed"), "Caixinha").parts[0].mesh])!.max[2]).toBeCloseTo(top, 1);
  });

  test("largura abaixo do mínimo avisa e o bolso continua inteiro", () => {
    const o = build({ shape: "heart", width: 34 });
    expect(o.warnings!.some((w) => w.includes("estreito"))).toBe(true);
    expect(body(o).intersect(tx(o, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
    expect(build({ shape: "heart", width: MIC_SHAPE_WIDTH.heart }).warnings!.some((w) => w.includes("estreito"))).toBe(false);
  });

  test("Lark A1 (retangular) e DJI Mic Mini (grosso): a espessura sobe se precisar e o microfone cabe", () => {
    const a1 = { ...P, micW: 30, micH: 16.3, micT: 8.8, micRound: false };
    const o = build({ ...a1, shape: "heart", width: 62 });
    empty(body(o), tx(o, a1));
    const dji = build({ shape: "star", width: 66, thickness: 18, micW: 26.55, micH: 26.06, micT: 15.96, micRound: false });
    expect(dji.layout!.thickness).toBeGreaterThan(18);
    expect(dji.warnings!.some((w) => w.includes("espessura"))).toBe(true);
  });

  test("anel de teste: uma peça só, impressa como a canopla (boca na mesa), com o mesmo bolso, travessa e janela", () => {
    const o = build({ print: "test" });
    expect(o.models).toHaveLength(1);
    const L = micLayout(P);
    const ring = solid(o.models[0].parts[0].mesh);
    const b = meshBounds([o.models[0].parts[0].mesh])!;
    const [cx, cy] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    expect(b.max[2] - b.min[2]).toBeCloseTo(L.cl + FRONT_WALL, 1);
    const y0 = cy - L.ch / 2; // chão do bolso
    // o microfone (redondo) entra pela mesa e vai até a parede de cima sem bater
    const r = P.micW / 2;
    const mic = M.Manifold.cylinder(P.micT, r, r, 64).rotate([-90, 0, 0]).translate([cx, y0 + P.clearance, L.cl - P.clearance - r]).add(box(cx - r, cx + r, y0 + P.clearance, y0 + P.clearance + P.micT, -5, L.cl - P.clearance - r));
    empty(ring, mic);
    full(ring, box(cx + L.slotW / 2 + 0.1, cx + L.cw / 2 - 1.1, y0 + L.cd + 0.05, y0 + L.cd + BAR_T - 0.05, 0.05, L.cl - 1)); // travessa
    empty(ring, box(cx - L.clipW / 2 + 1.1, cx + L.clipW / 2 - 1.1, y0 + L.ch - L.clipH + 0.1, y0 + L.ch - 0.1, -1, L.cl - L.clipW / 2)); // janela
  });

  test("texto vazio pede o texto; frente com desenho sem desenho pede o desenho", () => {
    expect(() => build({ text: " " })).toThrow(/texto/);
    expect(() => build({ front: "art" })).toThrow(/desenho/);
    expect(byName(build({ front: "none" }).models, "Caixinha").parts).toHaveLength(1);
  });

  test("cilindro: costas retas na mesa e o relevo acompanhando a curva da frente, por cima dela", () => {
    const o = build({ shape: "cylinder" });
    const fr = byName(o.models, "Caixinha").parts;
    expect(fr).toHaveLength(2);
    const T = o.layout!.thickness;
    expect(meshBounds([fr[1].mesh])!.max[2]).toBeCloseTo(T + P.relief, 0);
    expect(meshBounds([fr[0].mesh])!.max[2]).toBeLessThanOrEqual(T + 1e-3);
    expect(solid(fr[0].mesh).slice(0.2).area()).toBeGreaterThan(T * 20); // apoio largo na mesa
    const thin = build({ shape: "cylinder", width: 30 });
    empty(body(thin), tx(thin, P));
    expect(body(thin).intersect(tx(thin, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
  });

  describe("entra e sai por trás, deitado (#291, revisão do Gabriel)", () => {
    test.each(MIC_SHAPES.map(([s]) => s))("%s: o transmissor sai para trás sem bater, o clipe corre por cima da travessa, frente e paredes inteiras", (shape) => {
      const p = { ...P, shape, width: MIC_SHAPE_WIDTH[shape], front: shape === "art" ? ("art" as const) : ("text" as const) };
      const o = build(p, shape === "art");
      expect(o.warnings!.some((w) => w.includes("estreito")), shape).toBe(false);
      const fb = meshBounds([byName(o.models, "Caixinha").parts[0].mesh])!;
      expect(Math.max(fb.max[0] - fb.min[0], fb.max[1] - fb.min[1])).toBeLessThan(256);
      const b = body(o);
      const { L, T, yFront, yBack, zFloor } = pocketAt(o, p);
      empty(b, tx(o, p, 0, 60), "o transmissor passa pela abertura das costas");
      const zClip = zFloor + L.cd + BAR_T;
      empty(b, box(-L.clipW / 2 + 1.1, L.clipW / 2 - 1.1, yFront + L.clipW / 2, yBack + 60, zClip + 0.1, zClip + L.clipH - 0.1), "a perna do clipe corre na janela");
      // rasgo no meio da travessa: a haste do clipe passa das costas até o meio do transmissor
      const slotL = o.layout!.depth * SLOT_L;
      empty(b, box(-L.slotW / 2 + 0.1, L.slotW / 2 - 0.1, yBack - slotL + 0.1, yBack + 60, zFloor + 0.1, zClip + L.clipH - 0.1), "rasgo");
      expect(yBack - slotL).toBeLessThan(yFront + p.clearance + p.micH / 2 - L.slotW / 2);
      // a travessa dos dois lados do rasgo, do fundo até as costas
      for (const sx of [-1, 1]) full(b, box(sx > 0 ? L.slotW / 2 + 0.1 : -L.cw / 2 + 1.1, sx > 0 ? L.cw / 2 - 1.1 : -L.slotW / 2 - 0.1, yFront + L.cw / 2, yBack - 0.05, zFloor + L.cd + 0.05, zClip - 0.05));
      // a frente fecha o bolso com a parede mínima e os lados também
      const fw = shape === "cylinder" ? 3 : L.cw / 2 - 1.1; // cilindro: a frente é curva, a parede mínima fica no meio
      full(b, box(-fw, fw, yFront - FRONT_WALL + (shape === "cylinder" ? 0.3 : 0.05), yFront - 0.05, zFloor + 1.1, zFloor + L.cd - 1.1));
      const yWall = shape === "cylinder" ? 0 : yBack - 0.1;
      for (const sx of [-1, 1]) {
        const x0 = sx > 0 ? L.cw / 2 + 0.05 : -L.cw / 2 - MIC_WALL + 0.05;
        full(b, box(x0, x0 + MIC_WALL - 0.1, yFront + L.cw / 2, yWall, zFloor + 0.1, zFloor + L.ch - 0.1));
      }
      expect(T).toBeGreaterThanOrEqual(L.cl + FRONT_WALL);
    });

    test("costas com as proporções da referência (cubo de 38 mm, bolso Ø32,7 × 13,3): janelas, travessa, rasgo e paredes", () => {
      const L = micLayout(P);
      expect(L.clipH / L.cd).toBeCloseTo(10 / 13.3, 2);
      expect(L.clipW / L.cw).toBeCloseTo(19 / 33, 2);
      expect(L.slotW / L.cw).toBeCloseTo(9 / 33, 2);
      expect(SLOT_L).toBeCloseTo(29.8 / 35.8, 1);
      const side = (MIC_SHAPE_WIDTH.cube - L.cw) / 2;
      expect(side).toBeGreaterThanOrEqual(MIC_WALL);
      expect(side).toBeLessThanOrEqual(3.5);
      expect(DEFAULT_MIC_HOLDER.width).toBe(MIC_SHAPE_WIDTH.cube);
      expect(build().layout!.depth).toBeCloseTo(35.8, 1); // bolso de 35,8 mm de fundo na referência
    });

    test("a prévia mostra fora, entrando e dentro; o transmissor anda para a frente, fica sem encostar e não vai para o arquivo", () => {
      const o = build();
      const ys = ["out", "in", "back"].map((id) => meshBounds([byName(view(o, id), "Transmissor").parts[0].mesh])!.min[1]);
      expect(ys[0]).toBeLessThan(ys[1]); // de costas (girada): para trás é -y
      expect(ys[1]).toBeLessThan(ys[2]);
      empty(body(o), solid(byName(view(o, "closed"), "Transmissor").parts[0].mesh));
      expect(o.models.some((m) => m.name === "Transmissor")).toBe(false);
    });
  });
});
