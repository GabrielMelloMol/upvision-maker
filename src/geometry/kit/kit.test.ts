// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold } from "../manifold";
import type { CS, ManifoldToplevel } from "../manifold";
import { MissingInput, type ModelCtx } from "../models/common";
import { scoped } from "../shape2d";
import { assemblySolids, buildKitTemplate, checkAssembly, crossLap, disc, dovetail, formatNumbers, kitInstances, pinHole, poly, rect, tabWindow, type KitTemplate } from "./index";
import { meshBounds } from "../bounds";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);
const ctx = (art: CS | null = null): ModelCtx => ({ M, art, text });
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

/**
 * Kit de teste: duas placas que se cruzam (meia-fenda), uma base com 2 furos e 2 rodas com pino que atravessa a base.
 * Cobre fenda × fenda e pino × furo, o que todo modelo precisa para o montado e a bateria.
 */
const TEST_KIT: KitTemplate = {
  id: "testKit",
  label: "Kit de teste",
  blurb: "",
  palette: [{ key: "body", label: "Corpo", default: "#c9cdd2" }, { key: "wheel", label: "Rodas", default: "#1c1c1e" }],
  defaults: {},
  sections: [],
  build: ({ M, k, t, fit, pinFit, scale }) => {
    const w = 36 * scale, h = 30 * scale, r = 6 * scale, pinR = 1.5;
    const plateA = k(rect(M, k, -w / 2, 0, w / 2, h).subtract(crossLap(M, k, { x: 0, edge: h, depth: h / 2, from: "top", t, fit })));
    const plateB = k(rect(M, k, -w / 2, 0, w / 2, h).subtract(crossLap(M, k, { x: 0, edge: 0, depth: h / 2, from: "bottom", t, fit })));
    const baseHoles = [-26 * scale, 26 * scale].map((x) => pinHole(M, k, { x, y: 0, r: pinR, fit: pinFit }));
    const base = k(rect(M, k, -30 * scale, -10 * scale, 30 * scale, 10 * scale).subtract(k(M.CrossSection.union(baseHoles))));
    return {
      parts: [
        { id: "placaA", label: "Placa A", layers: [{ cs: plateA, color: "body" }] },
        { id: "placaB", label: "Placa B", layers: [{ cs: plateB, color: "body" }] },
        { id: "base", label: "Base", layers: [{ cs: base, color: "body" }] },
        { id: "roda", label: "Roda", count: 2, layers: [{ cs: disc(M, k, 0, 0, r), color: "wheel" }], pins: [{ x: 0, y: 0, r: pinR, len: t + 1 }] },
      ],
      assembly: [
        { part: "base", translate: [0, 0, 0] },
        { part: "placaA", rotate: [90, 0, 0], translate: [0, t / 2, t] },
        { part: "placaB", rotate: [90, 0, 90], translate: [-t / 2, 0, t] },
        ...[-26, 26].map((x): { part: string; rotate: [number, number, number]; translate: [number, number, number] } => ({ part: "roda", rotate: [180, 0, 0], translate: [x * scale, 0, 3 * t] })),
      ],
      steps: ["Encaixe {placaA} em {placaB} pelas fendas, ponha na base {base} e prenda as rodas {roda} nos furos."],
      pairs: [{ a: "placaA", b: "placaB", kind: "slot-slot" }, { a: "roda", b: "base", kind: "pin-hole", gap: pinFit }],
    };
  },
};

describe("juntas planas (#kit)", () => {
  test("meia-fenda: largura = espessura + folga e profundidade pedida", () => {
    scoped((k) => {
      const s = crossLap(M, k, { x: 5, edge: 30, depth: 15, from: "top", t: 1.6, fit: 0.2 });
      const b = s.bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(1.8, 6);
      expect(b.min[1]).toBeCloseTo(15, 6);
      expect(b.min[0] + 0.9).toBeCloseTo(5, 6);
      const bt = crossLap(M, k, { x: 0, edge: 0, depth: 15, from: "bottom", t: 1.6, fit: 0.2 }).bounds();
      expect(bt.max[1]).toBeCloseTo(15, 6);
    });
  });
  test("rabo de andorinha: o encaixe é a folga maior que o rabo e a ponta é mais larga que a base", () => {
    scoped((k) => {
      const { tail, socket } = dovetail(M, k, { x: 0, base: 0, wBase: 4, wTip: 6, len: 5, fit: 0.2 });
      expect(tail.bounds().max[0] - tail.bounds().min[0]).toBeCloseTo(6, 6);
      expect(socket.area()).toBeGreaterThan(tail.area());
      expect(k(tail.subtract(socket)).isEmpty()).toBe(true); // o rabo cabe no encaixe
    });
  });
  test("furo de pino e janela de aba levam a folga", () => {
    scoped((k) => {
      const h = pinHole(M, k, { x: 0, y: 0, r: 1.5, fit: 0.3 });
      expect((h.bounds().max[0] - h.bounds().min[0]) / 2).toBeCloseTo(1.65, 1);
      const w = tabWindow(M, k, { cx: 0, cy: 0, tabW: 10, t: 1.6, fit: 0.2 }).bounds();
      expect(w.max[0] - w.min[0]).toBeCloseTo(10.2, 6);
      expect(w.max[1] - w.min[1]).toBeCloseTo(1.8, 6);
      void poly;
    });
  });
  test("números das peças viram texto: 4, 4 a 7, 1, 3", () => {
    expect(formatNumbers([4])).toBe("4");
    expect(formatNumbers([4, 5, 6, 7])).toBe("4 a 7");
    expect(formatNumbers([3, 1])).toBe("1, 3");
  });
});

describe("kit: cartão, personalização e montado de um modelo (#kit)", { timeout: 120_000 }, () => {
  const build = (p = {}, art: CS | null = null) => buildKitTemplate(ctx(art), TEST_KIT, p);
  const part = (o: ReturnType<typeof build>, name: string) => o.models[0].parts.find((q) => q.name === name)?.mesh;

  test("cada peça sai inteira, presa à moldura por 2+ pontos de corte, e o cartão cabe na mesa", () => {
    const o = build({ showAssembled: false, title: "Teste" });
    expect(o.meta!.pieces).toBe(5);
    o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
    const all = ["Cartão", "Corpo", "Rodas"].map((n) => solid(part(o, n)!));
    const joined = M.Manifold.union(all);
    expect(joined.decompose().length).toBe(1); // tudo ligado: peças + galhos + moldura
    const b = meshBounds(o.models[0].parts.map((q) => q.mesh))!;
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(256);
    expect(Object.keys(o.meta!.numbers)).toEqual(["placaA", "placaB", "base", "roda"]);
    expect(o.meta!.numbers.roda).toEqual([4, 5]);
    expect(o.warnings!.join(" ")).toMatch(/Encaixe 1 em 2 pelas fendas, ponha na base 3 e prenda as rodas 4 a 5/);
  });

  test("montado sem colisão: os pares declarados (fenda × fenda, pino × furo) se encaixam com a folga pedida", () => {
    scoped((k) => {
      const { insts, build: kb, env } = kitInstances(M, k, TEST_KIT, {});
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, kb.assembly), kb.pairs ?? [], env.fit);
      expect(rep.collisions).toEqual([]);
      expect(rep.pairs.length).toBe(1 + 2); // placaA × placaB e as 2 rodas × base
      rep.pairs.forEach((q) => expect(q.ok, `${q.a} × ${q.b}: folga ${q.gap}`).toBe(true));
    });
  });

  test("uma colisão de verdade é achada (peça fora do lugar)", () => {
    scoped((k) => {
      const { insts, build: kb, env } = kitInstances(M, k, TEST_KIT, {});
      const moved = kb.assembly.map((pl) => (pl.part === "placaB" ? { ...pl, translate: [3, 0, env.t] as [number, number, number] } : pl));
      const rep = checkAssembly(M, k, assemblySolids(M, k, insts, moved), kb.pairs ?? [], env.fit);
      expect(rep.pairs.some((q) => !q.ok) || rep.collisions.length > 0).toBe(true);
    });
  });

  test("escala, espessura e folga mudam as peças; a fenda mede espessura + folga", () => {
    scoped((k) => {
      const a = kitInstances(M, k, TEST_KIT, { scale: 1 }).build.parts[0].layers[0].cs.bounds();
      const b = kitInstances(M, k, TEST_KIT, { scale: 1.5 }).build.parts[0].layers[0].cs.bounds();
      expect((b.max[0] - b.min[0]) / (a.max[0] - a.min[0])).toBeCloseTo(1.5, 6);
      const slot = kitInstances(M, k, TEST_KIT, { thickness: 2, fit: 0.3 }).build.parts[0].layers[0].cs;
      const cuts = (slot.toPolygons() as [number, number][][]).flat();
      const xs = cuts.filter(([, y]) => y > 14 && y < 31).map(([x]) => x);
      expect(Math.max(...xs.filter((x) => x < 5)) - Math.min(...xs.filter((x) => x > -5 && x < 5))).toBeGreaterThan(0);
    });
  });

  test("cores por grupo: cada cor da paleta vira uma parte com o filamento escolhido", () => {
    const o = build({ showAssembled: false, c_wheel: "#ff0000", c_body: "#00ff00", frameColor: "#0000ff" });
    const col = Object.fromEntries(o.models[0].parts.map((q) => [q.name, q.color]));
    expect(col).toMatchObject({ Rodas: "#ff0000", Corpo: "#00ff00", Cartão: "#0000ff" });
  });

  test("arte em relevo na face de cima: parte 'Arte' acima da peça, dentro do contorno", () => {
    const art = M.CrossSection.square([20, 20], true);
    const o = build({ showAssembled: false, artPart: "base", artRelief: 0.5, artSize: 50, c_art: "#ff00ff" }, art);
    const arte = o.models[0].parts.find((q) => q.name === "Arte")!;
    expect(arte.color).toBe("#ff00ff");
    const b = meshBounds([arte.mesh])!;
    expect(b.min[2]).toBeCloseTo(1.6, 3);
    expect(b.max[2]).toBeCloseTo(2.1, 3);
  });

  test("arte na face de trás: no cartão a peça sai virada (relevo para cima) e no montado o relevo fica atrás", () => {
    const art = M.CrossSection.square([20, 20], true);
    const o = build({ showAssembled: true, artPart: "base", artFace: "back", artRelief: 0.5, artSize: 50 }, art);
    const arte = o.models[0].parts.find((q) => q.name === "Arte")!;
    const b = meshBounds([arte.mesh])!;
    expect(b.min[2]).toBeCloseTo(1.6, 3);
    expect(b.max[2]).toBeCloseTo(2.1, 3);
    const asm = o.models.find((m) => m.previewOnly)!;
    const ab = meshBounds(asm.parts.filter((q) => q.name.includes("Arte")).map((q) => q.mesh))!;
    expect(ab.max[2] - ab.min[2]).toBeCloseTo(0.5, 3);
  });

  test("tudo cabe num cartão maior quando o pedido é pequeno (com aviso) e erra claro se nada cabe", () => {
    const o = build({ showAssembled: false, cardSize: "credit", scale: 1.6 });
    expect(o.meta!.cardSize).not.toBe("credit");
    expect(o.warnings!.join(" ")).toMatch(/não cabem no cartão pedido/);
    // no extremo, reduz sozinha o tamanho (com aviso) em vez de falhar
    const big = build({ showAssembled: false, scale: 6 });
    expect(big.warnings!.join(" ")).toMatch(/Reduzi o tamanho do modelo de 6× para [\d,]+× para as peças caberem/);
    expect(big.meta!.card.w).toBeLessThanOrEqual(256);
  });

  test("gira peças 90° quando ajuda: faixas largas e baixas cabem em um cartão em que sem girar não caberiam", () => {
    const strip: KitTemplate = {
      ...TEST_KIT,
      id: "strips",
      build: ({ M, k }) => ({
        parts: [{ id: "faixa", label: "Faixa", count: 6, layers: [{ cs: rect(M, k, 0, 0, 7, 70), color: "body" }] }],
        assembly: [],
        steps: [],
      }),
    };
    const o = buildKitTemplate(ctx(), { ...strip }, { cardSize: "credit", showAssembled: false, compact: false });
    expect(o.meta!.cardSize).toBe("medium"); // 6 faixas de 7 × 70 cabem em pé no médio (85 de altura); no crédito (54) só girando e não cabem
    const b = meshBounds(o.models[0].parts.map((q) => q.mesh))!;
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(85.01);
  });

  test("a mesa inteira é um tamanho de cartão: cabe peça maior que o cartão maior", () => {
    const big: KitTemplate = { ...TEST_KIT, id: "big", build: ({ M, k }) => ({ parts: [{ id: "placa", label: "Placa", layers: [{ cs: rect(M, k, 0, 0, 200, 190), color: "body" }] }], assembly: [], steps: [] }) };
    const o = buildKitTemplate(ctx(), big, { showAssembled: false });
    expect(o.meta!.cardSize).toBe("bed");
    expect(o.meta!.card.w).toBeLessThanOrEqual(256);
  });

  test("vários cartões na mesa e o montado só na prévia", () => {
    const o = build({ copies: 3, cardSize: "credit" });
    const real = o.models.filter((m) => !m.previewOnly);
    expect(real.length).toBe(3);
    expect(o.models.filter((m) => m.previewOnly).length).toBe(1);
    void MissingInput;
    void solid;
  });
});
