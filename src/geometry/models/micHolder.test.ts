import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { BAR_T, buildMicHolder, DEFAULT_MIC_HOLDER, MIC_SHAPES, MIC_SHAPE_WIDTH, MIC_WALL, micLayout, PIN_D, TENON_FIT, BOTTOM_WALL, PEG_D, PEG_H, FOAM_DEPTH, type MicHolderParams } from "./micHolder";

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

/** A metade deitada sem o relevo, de volta com o eixo do microfone em x = 0 (o `spread` só anda em X; frente e costas são simétricas). */
function half(ms: Model[], name: string): Solid {
  const m = byName(ms, name).parts[0].mesh;
  const b = meshBounds([m])!;
  return solid(m).translate([-(b.min[0] + b.max[0]) / 2, 0, 0]);
}
/** As duas metades montadas, como na vista "Montada": x = largura, +y = para trás, z = altura. */
const body = (o: Out) => M.Manifold.union(["Frente", "Costas"].map((n) => solid(byName(o.views!.find((v) => v.id === "closed")!.models, n).parts[0].mesh)));
/** Caixa de x0..x1, y0..y1, z0..z1. */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
/** Onde fica o bolso na peça montada: fundo (frente) e boca (costas) em y, chão em z. */
function pocketAt(o: Out, p: MicHolderParams) {
  const L = micLayout(p);
  const T = o.layout!.thickness;
  return { L, T, yFront: T / 2 - L.cl, yBack: T / 2, zFloor: o.layout!.cy - L.ch / 2 };
}
/** O transmissor (bloco do tamanho da ficha) deitado no bolso, encostado na frente; `grow` engorda, `back` estica para trás (o caminho de saída). */
function tx(o: Out, p: MicHolderParams, grow = 0, back = 0): Solid {
  const { yFront, zFloor } = pocketAt(o, p);
  const [y0, z0] = [yFront + p.clearance, zFloor + p.clearance];
  return box(-p.micW / 2 - grow, p.micW / 2 + grow, y0 - grow, y0 + p.micH + grow + back, z0 - grow, z0 + p.micT + grow);
}

describe("canopla de microfone (#274)", { timeout: 120_000 }, () => {
  test("o Lark M2 cabe deitado no bolso com a folga e sem encostar; um microfone maior que a folga bate na parede", () => {
    const o = build();
    const b = body(o);
    expect(b.intersect(tx(o, P)).volume()).toBeLessThan(0.01);
    expect(b.intersect(tx(o, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
  });

  test("o cabo cola num rebaixo raso embaixo, como a referência, sem tocar no bolso (o cabo fica fixo)", () => {
    const o = build();
    const L = micLayout(P);
    expect(L.peg).toBeCloseTo(PEG_D - 2 * TENON_FIT);
    expect(o.layout!.tenonL).toBeCloseTo(PEG_H);
    const h = meshBounds([byName(o.models, "Cabo").parts[0].mesh])!;
    expect(h.max[2] - h.min[2]).toBeLessThan(P.handleL + PEG_H);
    const { zFloor } = pocketAt(o, P);
    expect(zFloor).toBeCloseTo(BOTTOM_WALL, 5); // parede de baixo da abertura: 1 mm, como a referência
    const floor = box(-PEG_D / 2, PEG_D / 2, -1, 1, PEG_H + 0.05, zFloor - 0.05);
    expect(body(o).intersect(floor).volume()).toBeCloseTo(floor.volume(), 1);
  });

  test("sem pescoço: a espuma entra apertada num furo no topo, que dá na janela do clipe", () => {
    const o = build();
    const b = body(o);
    const top = o.layout!.top;
    const hole = M.Manifold.cylinder(FOAM_DEPTH - 0.1, P.neckD / 2 - 0.1, P.neckD / 2 - 0.1, 48).translate([0, 0, top - FOAM_DEPTH + 0.05]);
    expect(b.intersect(hole).volume()).toBeLessThan(0.01);
    expect(meshBounds([byName(o.views!.find((v) => v.id === "closed")!.models, "Costas").parts[0].mesh])!.max[2]).toBeCloseTo(top, 1); // nada acima do corpo
  });

  test("dois pinos simétricos, furo nas duas metades no mesmo lugar e pino menor que os dois furos juntos", () => {
    const o = build({ shape: "heart", width: MIC_SHAPE_WIDTH.heart });
    const { pins, pinDepth } = o.layout!;
    expect(pins).toHaveLength(2);
    expect(pins[0][0]).toBeCloseTo(-pins[1][0]);
    const probe = (x: number, y: number) => M.Manifold.cylinder(pinDepth, PIN_D / 2, PIN_D / 2, 24).translate([x, y, 0]);
    for (const n of ["Frente", "Costas"]) for (const [x, y] of pins) expect(half(o.models, n).intersect(probe(x, y)).volume()).toBeLessThan(0.01);
    const pb = meshBounds([byName(o.models, "Pinos").parts[0].mesh])!;
    expect(pb.max[2] - pb.min[2]).toBeLessThan(2 * pinDepth);
  });

  test("metades deitadas com o corte na mesa; nada abaixo da mesa; o relevo fica na face de cima da frente", () => {
    const o = build();
    for (const m of o.models) for (const part of m.parts) expect(meshBounds([part.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-6);
    const relief = byName(o.models, "Frente").parts[1];
    expect(relief.color).toBe(P.artColor);
    expect(meshBounds([relief.mesh])!.min[2]).toBeCloseTo(P.width / 2, 0); // cubo: espessura = largura
    expect(new Set(o.models.flatMap((m) => m.parts.map((p) => p.color))).size).toBe(2);
  });

  test("largura abaixo do mínimo avisa e o bolso continua inteiro", () => {
    const o = build({ shape: "heart", width: 34 });
    expect(o.warnings!.some((w) => w.includes("estreito"))).toBe(true);
    expect(body(o).intersect(tx(o, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
    expect(build({ shape: "heart", width: MIC_SHAPE_WIDTH.heart }).warnings!.some((w) => w.includes("estreito"))).toBe(false);
  });

  test("todos os formatos geram, com a largura sugerida, sem aviso de estreito e cabem na mesa de 256", () => {
    for (const [shape] of MIC_SHAPES) {
      const o = build({ shape, width: MIC_SHAPE_WIDTH[shape], front: shape === "art" ? "art" : "text" }, shape === "art");
      expect(o.warnings!.some((w) => w.includes("estreito")), shape).toBe(false);
      // o cubo é justo como a referência: sem lugar para pinos, as metades se alinham pelo encaixe do cabo
      expect(o.layout!.pins, shape).toHaveLength(shape === "cube" ? 0 : 2);
      if (shape === "cube") expect(o.warnings!.some((w) => w.includes("alinhe pelas bordas"))).toBe(true);
      const fb = meshBounds([byName(o.models, "Frente").parts[0].mesh])!;
      expect(fb.max[1] - fb.min[1], shape).toBeLessThan(256);
    }
  });

  test("Lark A1 (retangular) e DJI Mic Mini (grosso): a espessura sobe se precisar e o microfone cabe", () => {
    const a1 = { ...P, micW: 30, micH: 16.3, micT: 8.8, micRound: false };
    const o = build({ ...a1, shape: "heart", width: 62 });
    expect(body(o).intersect(tx(o, a1)).volume()).toBeLessThan(0.01);
    const dji = build({ shape: "star", width: 66, thickness: 18, micW: 26.55, micH: 26.06, micT: 15.96, micRound: false });
    expect(dji.layout!.thickness).toBeGreaterThan(18);
    expect(dji.warnings!.some((w) => w.includes("espessura"))).toBe(true);
  });

  test("anel de teste: uma peça só, com o mesmo bolso, a mesma travessa e a mesma janela das costas", () => {
    const o = build({ print: "test" });
    expect(o.models).toHaveLength(1);
    const L = micLayout(P);
    const ring = solid(o.models[0].parts[0].mesh);
    const b = meshBounds([o.models[0].parts[0].mesh])!;
    const [cx, cy] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    expect(b.max[2] - b.min[2]).toBeCloseTo(L.cl + MIC_WALL, 1);
    const y0 = cy - L.ch / 2; // chão do bolso; aqui o fundo do bolso é z = MIC_WALL e a boca fica em cima
    // o microfone deitado (na peça, de pé no z) desce até o fundo e sai por cima sem bater
    const mic = box(cx - P.micW / 2, cx + P.micW / 2, y0 + P.clearance, y0 + P.clearance + P.micT, MIC_WALL + P.clearance, 80);
    expect(ring.intersect(mic).volume()).toBeLessThan(0.01);
    const bar = box(cx + L.slotW / 2 + 0.1, cx + L.cw / 2 - 1.1, y0 + L.cd + 0.05, y0 + L.cd + BAR_T - 0.05, MIC_WALL + 0.05, b.max[2] - 0.05);
    expect(ring.intersect(bar).volume()).toBeCloseTo(bar.volume(), 1);
    const clip = box(cx - L.clipW / 2 + 1.1, cx + L.clipW / 2 - 1.1, y0 + L.ch - L.clipH + 0.1, y0 + L.ch - 0.1, MIC_WALL + 0.05, 80);
    expect(ring.intersect(clip).volume()).toBeLessThan(0.01);
  });

  test("texto vazio pede o texto; frente com desenho sem desenho pede o desenho", () => {
    expect(() => build({ text: " " })).toThrow(/texto/);
    expect(() => build({ front: "art" })).toThrow(/desenho/);
    expect(build({ front: "none" }).models[0].parts).toHaveLength(1);
  });

  test("cilindro: o relevo acompanha a curva e fica por cima dela", () => {
    const o = build({ shape: "cylinder" });
    const fr = byName(o.models, "Frente").parts;
    expect(fr).toHaveLength(2);
    const R = o.layout!.thickness / 2;
    expect(meshBounds([fr[1].mesh])!.max[2]).toBeCloseTo(R + P.relief, 0);
    expect(meshBounds([fr[0].mesh])!.max[2]).toBeLessThanOrEqual(R + 1e-3); // nada fura a curva
    const thin = build({ shape: "cylinder", width: 30 });
    expect(body(thin).intersect(tx(thin, P)).volume()).toBeLessThan(0.01);
    expect(body(thin).intersect(tx(thin, P, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
  });

  describe("entra e sai por trás, deitado (#291, revisão do Gabriel)", () => {
    test.each(MIC_SHAPES.map(([s]) => s))("%s: o transmissor sai para trás sem bater, o clipe corre por cima da travessa, frente e paredes inteiras", (shape) => {
      const p = { ...P, shape, width: MIC_SHAPE_WIDTH[shape], front: shape === "art" ? ("art" as const) : ("text" as const) };
      const o = build(p, shape === "art");
      const b = body(o);
      const { L, T, yFront, yBack, zFloor } = pocketAt(o, p);
      // caminho de saída: do lugar dele até bem atrás da peça, sem tocar em nada (e sem passar pelo cabo)
      expect(b.intersect(tx(o, p, 0, 60)).volume(), "o transmissor passa pela abertura das costas").toBeLessThan(0.01);
      const zClip = zFloor + L.cd + BAR_T;
      expect(b.intersect(box(-L.clipW / 2 + 1.1, L.clipW / 2 - 1.1, yFront + 0.1, yBack + 60, zClip + 0.1, zClip + L.clipH - 0.1)).volume(), "a perna do clipe corre na janela").toBeLessThan(0.01);
      // rasgo no meio da travessa: a haste do clipe passa das costas até o meio do transmissor
      expect(b.intersect(box(-L.slotW / 2 + 0.1, L.slotW / 2 - 0.1, yBack - L.slotL + 0.1, yBack + 60, zFloor + 0.1, zClip + L.clipH - 0.1)).volume(), "rasgo").toBeLessThan(0.01);
      expect(yBack - L.slotL).toBeLessThan(yFront + p.clearance + p.micH / 2 - L.slotW / 2);
      // a travessa dos dois lados do rasgo, do fundo até as costas (no cilindro, até onde a curva deixa)
      const yEnd = shape === "cylinder" ? Math.sqrt((T / 2) ** 2 - (L.cw / 2) ** 2) - 0.3 : yBack - 0.05;
      for (const sx of [-1, 1]) {
        const bar = box(sx > 0 ? L.slotW / 2 + 0.1 : -L.cw / 2 + 1.1, sx > 0 ? L.cw / 2 - 1.1 : -L.slotW / 2 - 0.1, yFront + 0.05, yEnd, zFloor + L.cd + 0.05, zClip - 0.05);
        expect(b.intersect(bar).volume(), "travessa").toBeCloseTo(bar.volume(), 1);
      }
      expect(BAR_T).toBeGreaterThanOrEqual(2);
      // a frente fecha o bolso com a parede mínima
      const front = box(-L.cw / 2 + 1.1, L.cw / 2 - 1.1, yFront - MIC_WALL + 0.05, yFront - 0.05, zFloor + 1.1, zFloor + L.cd - 1.1);
      expect(b.intersect(front).volume(), "frente fechada").toBeCloseTo(front.volume(), 1);
      // paredes dos lados do bolso com o mínimo (sem contar os furos dos pinos)
      const yWall = shape === "cylinder" ? Math.sqrt((T / 2) ** 2 - (L.coreW / 2) ** 2) - 0.3 : yBack - 0.1;
      const pinHoles = M.Manifold.union(o.layout!.pins.flatMap(([x, y]) => [-x, x].map((px) => box(px - PIN_D, px + PIN_D, -20, 20, y - PIN_D, y + PIN_D))));
      for (const sx of [-1, 1]) {
        const x0 = sx > 0 ? L.cw / 2 + 0.05 : -L.cw / 2 - MIC_WALL + 0.05;
        const wall = box(x0, x0 + MIC_WALL - 0.1, yFront + 0.1, yWall, zFloor + 0.1, zFloor + L.ch - 0.1).subtract(pinHoles);
        expect(b.intersect(wall).volume(), "parede").toBeCloseTo(wall.volume(), 0);
      }
    });

    test("costas com as proporções da referência (cubo de 38 mm, bolso Ø32,7 × 13,3): janelas, travessa, rasgo e paredes", () => {
      const L = micLayout(P);
      expect(L.clipH / L.cd).toBeCloseTo(10 / 13.3, 2);
      expect(L.clipW / L.cw).toBeCloseTo(19 / 33, 2);
      expect(L.slotW / L.cw).toBeCloseTo(9 / 33, 2);
      expect(L.slotL / L.cl).toBeCloseTo(29 / 35, 2);
      // cubo padrão justo em volta do bolso: parede dos lados nas costas perto dos 2,5 mm da referência
      const side = (MIC_SHAPE_WIDTH.cube - L.cw) / 2;
      expect(side).toBeGreaterThanOrEqual(MIC_WALL);
      expect(side).toBeLessThanOrEqual(3.5);
      expect(DEFAULT_MIC_HOLDER.width).toBe(MIC_SHAPE_WIDTH.cube);
      // costas quase todas abertas: a abertura ocupa ~60 % da face de trás do cubo padrão (59 % na referência)
      const o = build();
      const face = meshBounds([byName(o.views!.find((v) => v.id === "closed")!.models, "Costas").parts[0].mesh])!;
      const open = L.cw * L.cd + L.clipW * L.clipH + L.slotW * BAR_T;
      expect(open / ((face.max[0] - face.min[0]) * (face.max[2] - face.min[2]))).toBeGreaterThan(0.55);
    });

    test("imprime sem suporte: nas costas a abertura atravessa a metade sem teto; na frente o bolso só entra do corte para cima", () => {
      const o = build();
      const { L, T } = pocketAt(o, P);
      const cy = o.layout!.cy;
      const y0 = cy - L.ch / 2;
      const prism = (z0: number, z1: number) => M.Manifold.union([box(-L.cw / 2 + 1.1, L.cw / 2 - 1.1, y0 + 0.05, y0 + L.cd - 0.05, z0, z1), box(-L.clipW / 2 + 1.1, L.clipW / 2 - 1.1, y0 + L.ch - L.clipH + 0.05, y0 + L.ch - 0.05, z0, z1)]);
      expect(half(o.models, "Costas").intersect(prism(Math.max(0, T / 2 - L.cl) + 0.01, T)).volume()).toBeLessThan(0.01);
      expect(L.cl).toBeGreaterThan(T / 2); // o cubo padrão é fino o bastante para o bolso passar do corte
      expect(half(o.models, "Frente").intersect(prism(0.01, L.cl - T / 2 - 0.01)).volume()).toBeLessThan(0.01);
      expect(L.cd).toBeLessThanOrEqual(15); // teto do bolso na frente: ponte curta
    });

    test("a prévia mostra fora, entrando e dentro; o transmissor anda para a frente, fica sem encostar e não vai para o arquivo", () => {
      const o = build();
      const ids = ["out", "in", "back"];
      const ys = ids.map((id) => {
        const v = o.views!.find((x) => x.id === id)!;
        return meshBounds([byName(v.models, "Transmissor").parts[0].mesh])!.min[1];
      });
      expect(ys[0]).toBeLessThan(ys[1]); // de costas (girada): para trás é -y
      expect(ys[1]).toBeLessThan(ys[2]);
      const inside = solid(byName(o.views!.find((x) => x.id === "closed")!.models, "Transmissor").parts[0].mesh);
      expect(body(o).intersect(inside).volume()).toBeLessThan(0.01);
      expect(o.models.some((m) => m.name === "Transmissor")).toBe(false);
    });
  });
});
