import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { Mesh, Model } from "../types";
import type { ModelCtx } from "./common";
import { BAR_T, buildMicHolder, DEFAULT_MIC_HOLDER, MIC_SHAPES, MIC_SHAPE_WIDTH, MIC_WALL, micLayout, PIN_D, TENON_FIT, type MicHolderParams } from "./micHolder";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (art = false): ModelCtx => ({ M, art: art ? M.CrossSection.circle(20, 32) : null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<MicHolderParams> = {}, art = false) => buildMicHolder(ctx(art), { ...DEFAULT_MIC_HOLDER, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const byName = (ms: Model[], n: string) => ms.find((m) => m.name === n)!;
const P = DEFAULT_MIC_HOLDER;

/** A metade sem o relevo, de volta com o eixo do microfone em x = 0 (o `spread` só anda em X; frente e costas são simétricas). */
function half(ms: Model[], name: string): Solid {
  const m = byName(ms, name).parts[0].mesh;
  const b = meshBounds([m])!;
  const s = solid(m);
  return s.translate([-(b.min[0] + b.max[0]) / 2, 0, 0]);
}
/** O microfone (bloco do tamanho da ficha), de pé com o centro em y = cy, só a parte da metade (z de 0 a micT/2). */
function micHalf(p: MicHolderParams, cy: number, grow = 0): Solid {
  const L = micLayout({ ...p, clearance: 0 });
  const cs = M.CrossSection.square([p.micW + 2 * grow, p.micH + 2 * grow], true).offset(-Math.min(L.radius, p.micW / 2 - 0.01), "Round").offset(Math.min(L.radius, p.micW / 2 - 0.01), "Round");
  return cs.extrude(p.micT / 2 + grow).translate([0, cy, 0]);
}

describe("canopla de microfone (#274)", { timeout: 60_000 }, () => {
  test("o Lark M2 cabe no berço com a folga e sem encostar; um microfone maior que a folga bate na parede", () => {
    const o = build();
    const cy = o.layout!.cy;
    for (const n of ["Frente", "Costas"]) {
      const h = half(o.models, n);
      expect(h.intersect(micHalf(P, cy)).volume()).toBeLessThan(0.01);
      expect(h.intersect(micHalf(P, cy, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
    }
  });

  test("o encaixe do cabo entra no canal com folga justa e para logo abaixo do microfone", () => {
    const o = build();
    const L = micLayout(P);
    expect(L.tenon[0]).toBeCloseTo(L.cw - 2 * TENON_FIT);
    expect(L.tenon[1]).toBeCloseTo(L.cd - 2 * TENON_FIT);
    const h = meshBounds([byName(o.models, "Cabo").parts[0].mesh])!;
    expect(h.max[2] - h.min[2]).toBeCloseTo(P.handleL + o.layout!.tenonL, 1);
    expect(o.layout!.tenonL).toBeCloseTo(o.layout!.cy - L.ch / 2 + L.slide, 5); // sobe até o microfone, já empurrado contra a travessa
    expect(o.layout!.tenonL).toBeGreaterThanOrEqual(8);
  });

  test("dois pinos simétricos, furo nas duas metades no mesmo lugar e pino menor que os dois furos juntos", () => {
    const o = build();
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

  test("largura abaixo do mínimo avisa e o berço continua inteiro", () => {
    const o = build({ shape: "heart", width: 34 });
    expect(o.warnings!.some((w) => w.includes("estreito"))).toBe(true);
    const h = half(o.models, "Frente");
    expect(h.intersect(micHalf(P, o.layout!.cy, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
    expect(build({ shape: "heart", width: MIC_SHAPE_WIDTH.heart }).warnings!.some((w) => w.includes("estreito"))).toBe(false);
  });

  test("todos os formatos geram, com a largura sugerida, sem aviso de estreito e cabem na mesa de 256", () => {
    for (const [shape] of MIC_SHAPES) {
      const o = build({ shape, width: MIC_SHAPE_WIDTH[shape], front: shape === "art" ? "art" : "text" }, shape === "art");
      expect(o.warnings!.some((w) => w.includes("estreito")), shape).toBe(false);
      expect(o.layout!.pins, shape).toHaveLength(2);
      const fb = meshBounds([byName(o.models, "Frente").parts[0].mesh])!;
      expect(fb.max[1] - fb.min[1], shape).toBeLessThan(256);
    }
  });

  test("Lark A1 (retangular) e DJI Mic Mini (grosso): a espessura sobe se precisar e o microfone cabe", () => {
    const a1 = { micW: 30, micH: 16.3, micT: 8.8, micRound: false };
    const o = build({ shape: "heart", width: 62, ...a1 });
    expect(half(o.models, "Frente").intersect(micHalf({ ...P, ...a1 }, o.layout!.cy)).volume()).toBeLessThan(0.01);
    const dji = build({ shape: "star", width: 66, thickness: 18, micW: 26.55, micH: 26.06, micT: 15.96, micRound: false });
    expect(dji.layout!.thickness).toBeGreaterThan(18);
    expect(dji.warnings!.some((w) => w.includes("espessura"))).toBe(true);
  });

  test("anel de teste: uma peça só, com a mesma janela e a mesma travessa das costas", () => {
    const o = build({ print: "test" });
    expect(o.models).toHaveLength(1);
    const L = micLayout(P);
    const ring = solid(o.models[0].parts[0].mesh);
    const b = meshBounds([o.models[0].parts[0].mesh])!;
    const cx = (b.min[0] + b.max[0]) / 2, y0 = (b.min[1] + b.max[1]) / 2 - L.ch / 2;
    expect(b.max[2] - b.min[2]).toBeCloseTo(L.cd + BAR_T, 1);
    // o microfone (com folga) passa pela janela de baixo, de cima a baixo da peça
    const r = L.radius - 0.05;
    const pass = M.CrossSection.square([L.cw - 0.1 - 2 * r, L.win - 0.1 - 2 * r], true).offset(r, "Round").extrude(40).translate([cx, y0 + L.win / 2, -5]);
    expect(ring.intersect(pass).volume()).toBeLessThan(0.01);
    // a travessa fica no topo, do mesmo tamanho da das costas
    const bar = M.Manifold.cube([L.cw - 2, L.bar - 0.2, BAR_T - 0.2], true).translate([cx, y0 + L.win + L.bar / 2, L.cd + BAR_T / 2]);
    expect(ring.intersect(bar).volume()).toBeCloseTo(bar.volume(), 1);
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
    expect(meshBounds([fr[1].mesh])!.max[2]).toBeCloseTo(P.width / 2 + P.relief, 0);
    expect(meshBounds([fr[0].mesh])!.max[2]).toBeLessThanOrEqual(P.width / 2 + 1e-3); // nada fura a curva
    const thin = build({ shape: "cylinder", width: 30 });
    expect(half(thin.models, "Frente").intersect(micHalf(P, thin.layout!.cy)).volume()).toBeLessThan(0.01);
    expect(half(thin.models, "Frente").intersect(micHalf(P, thin.layout!.cy, P.clearance + 0.3)).volume()).toBeGreaterThan(1);
  });

  describe("costas abertas (#291)", () => {
    /** A metade como saiu do molde (corte em z = 0, eixo do microfone em x = 0), lida da vista montada (que não é espalhada). */
    const local = (o: ReturnType<typeof build>, name: "Frente" | "Costas") => {
      const m = o.views!.find((v) => v.id === "closed")!.models.find((x) => x.name === name)!.parts[0].mesh;
      const q = m.positions.slice();
      for (let i = 0; i < q.length; i += 3) [q[i + 1], q[i + 2]] = name === "Costas" ? [q[i + 2], q[i + 1]] : [q[i + 2], -q[i + 1]];
      // a troca de eixos espelha: inverte a ordem dos triângulos para o sólido continuar com a face para fora
      const t = m.indices.slice();
      for (let i = 0; i < t.length; i += 3) [t[i + 1], t[i + 2]] = [t[i + 2], t[i + 1]];
      return solid({ positions: q, indices: name === "Costas" ? t : m.indices });
    };
    /** O microfone com a folga, na posição de entrada (embaixo do bolso), atravessando a metade inteira. */
    const through = (p: MicHolderParams, cy: number) => {
      const L = micLayout(p);
      return micHalf({ ...p, micT: 200 }, cy - L.slide / 2, 0).translate([0, 0, -50]);
    };
    test.each(MIC_SHAPES.map(([s]) => s))("%s: janela nas costas por onde o microfone passa, travessa inteira, frente fechada", (shape) => {
      const p = { ...P, shape, width: MIC_SHAPE_WIDTH[shape], front: shape === "art" ? ("art" as const) : ("text" as const) };
      const o = build(p, shape === "art");
      const L = micLayout(p);
      const cy = o.layout!.cy;
      const back = local(o, "Costas");
      expect(back.intersect(through(p, cy)).volume(), "o microfone passa pela janela").toBeLessThan(0.01);
      expect(local(o, "Frente").intersect(through(p, cy)).volume(), "frente fechada").toBeGreaterThan(50);
      // travessa: cruza o bolso de lado a lado, logo atrás do microfone, com a espessura mínima de parede
      const yBar = cy - L.ch / 2 + L.win;
      const bar = M.Manifold.cube([L.cw, L.bar - 0.2, BAR_T - 0.2], true).translate([0, yBar + L.bar / 2, L.cd / 2 + BAR_T / 2]);
      expect(back.intersect(bar).volume()).toBeCloseTo(bar.volume(), 1);
      expect(BAR_T).toBeGreaterThanOrEqual(MIC_WALL);
      // janela de cima: aberta acima da travessa (mostra o clipe)
      const up = M.Manifold.cube([6, L.slide - L.bar - 2, 50], true).translate([0, yBar + L.bar + (L.slide - L.bar) / 2, 25]);
      expect(back.intersect(up).volume()).toBeLessThan(0.01);
      // paredes dos lados do bolso continuam com o mínimo nas duas metades
      for (const n of ["Frente", "Costas"]) {
        const h = local(o, n as "Frente" | "Costas");
        for (const sx of [-1, 1]) {
          const pinHoles = M.Manifold.union(o.layout!.pins.map(([x, y]) => M.Manifold.cylinder(50, PIN_D / 2 + 0.2, PIN_D / 2 + 0.2, 24).translate([x, y, -1])));
          const wall = M.Manifold.cube([MIC_WALL - 0.1, L.ch * 0.6, L.cd / 2], false).translate([sx > 0 ? L.cw / 2 + 0.05 : -L.cw / 2 - MIC_WALL + 0.05, cy - L.ch * 0.3, 0]).subtract(pinHoles);
          expect(h.intersect(wall).volume(), `${n} parede`).toBeCloseTo(wall.volume(), 0);
        }
      }
    });

    test("metade das costas imprime sem suporte: só a travessa fica no ar, apoiada nas duas pontas", () => {
      const o = build();
      const L = micLayout(P);
      const back = local(o, "Costas");
      // acima do bolso (z > cd/2), dentro da área do bolso, só existe a travessa
      const cy = o.layout!.cy;
      const r = L.radius - 0.1;
      const over = M.CrossSection.square([L.cw - 0.1 - 2 * r, L.ch - 0.1 - 2 * r], true).offset(r, "Round").extrude(50).translate([0, cy, L.cd / 2 + 0.01]);
      const bar = M.Manifold.cube([L.cw, L.bar, BAR_T]).translate([-L.cw / 2, cy - L.ch / 2 + L.win, L.cd / 2]);
      expect(back.intersect(over).intersect(bar).volume()).toBeGreaterThan(L.bar * BAR_T * 10);
      expect(back.intersect(over).subtract(bar).volume()).toBeLessThan(0.01);
    });

    test("a prévia tem a vista de costas com o transmissor dentro, que não vai para o arquivo", () => {
      const o = build();
      const v = o.views!.find((x) => x.id === "back")!;
      expect(v).toBeTruthy();
      expect(v.models.some((m) => m.name === "Transmissor")).toBe(true);
      expect(o.models.some((m) => m.name === "Transmissor")).toBe(false);
    });
  });
});
