import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { buildLedBase, buildLid, LED } from "./lithophaneLed";
import { getManifold, type ManifoldToplevel } from "./manifold";
import type { Mesh } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const size = (m: Mesh) => {
  const b = meshBounds([m])!;
  return { w: b.max[0] - b.min[0], d: b.max[1] - b.min[1], h: b.max[2] - b.min[2], b };
};
/** Contornos de um corte: o maior (fora) e os furos (área negativa). */
const holes = (s: ReturnType<typeof solid>, z: number) =>
  s.slice(z).toPolygons().filter((p) => p.reduce((a, [x, y], i) => a + (x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y), 0) < 0).map((p) => {
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
  });

describe("base de LED para peça em pé (#101)", { timeout: 60_000 }, () => {
  const P = { layout: "panel" as const, slotW: 100, slotT: 3, led: "disc" as const, ledSize: 50, power: "cable" as const };

  test("uma peça só; encaixe no topo com folga dos dois lados, na profundidade pedida", () => {
    const { base } = buildLedBase(M, P);
    const s = solid(base);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    expect(size(base).b.min[2]).toBeCloseTo(0, 3);
    expect(size(base).h).toBeCloseTo(LED.baseHeight, 2);
    const slot = holes(s, LED.baseHeight - 1)[0]; // 1 mm abaixo do topo: só o encaixe
    expect(slot.w).toBeCloseTo(100 + 2 * LED.fit, 1);
    expect(slot.d).toBeCloseTo(3 + 2 * LED.fit, 1);
    expect(holes(s, LED.baseHeight - LED.slotDepth - 1).some((h) => Math.abs(h.w - slot.w) < 0.1)).toBe(false); // abaixo da profundidade o encaixe acaba
  });

  test("cavidade do disco de LED com 0,3 mm de folga e janela de luz subindo ao encaixe", () => {
    const { base } = buildLedBase(M, P);
    const s = solid(base);
    const cav = holes(s, LED.rebate + 6.5).find((h) => h.w > 40)!; // dentro da altura do LED, acima do furo do cabo
    expect(cav.w).toBeCloseTo(50 + 2 * LED.cavityClear, 0);
    expect(cav.d).toBeCloseTo(50 + 2 * LED.cavityClear, 0);
    // a janela: no fundo do encaixe o corte é um único vão que junta o encaixe e a cavidade
    const joined = holes(s, LED.baseHeight - LED.slotDepth + 0.5);
    expect(joined.length).toBeGreaterThan(0);
  });

  test("tampa de baixo entra no rebaixo com folga e fecha a cavidade", () => {
    const { base, plate } = buildLedBase(M, P);
    const reb = holes(solid(base), 0.5)[0]; // rebaixo (no corte de 0,5 mm acima da mesa)
    const p = size(plate);
    expect(p.h).toBeCloseTo(LED.plateT, 2);
    expect(reb.w - p.w).toBeGreaterThan(2 * LED.plateClear - 0.05); // folga dos dois lados
    expect(reb.w - p.w).toBeLessThan(2 * LED.plateClear + 0.4);
    expect(LED.plateT).toBeLessThan(LED.rebate); // fica rente ou um pouco para dentro, não sobra para fora
  });

  test("saída de cabo: o furo de 5 mm abre a cavidade para fora pela parede de trás; sem cabo (pilha) ela fica fechada", () => {
    const cable = solid(buildLedBase(M, P).base);
    // na altura do furo, a cavidade se liga à borda: não é mais um vão fechado
    expect(holes(cable, LED.rebate + 3).some((h) => h.w > 40)).toBe(false);
    expect(holes(cable, LED.rebate + 6.5).some((h) => h.w > 40)).toBe(true); // acima do furo, o vão é fechado
    const battery = solid(buildLedBase(M, { ...P, power: "battery" }).base);
    expect(holes(battery, LED.rebate + 3).some((h) => h.w > 40)).toBe(true); // sem furo de cabo: fechado também na altura dele
  });

  test("compartimento de 2 pilhas AAA: bolsão de 47 × 23 mm aberto embaixo, atrás da cavidade, e a base cresce para trás", () => {
    const cable = size(buildLedBase(M, P).base);
    const { base } = buildLedBase(M, { ...P, power: "battery" });
    const s = solid(base);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    expect(size(base).d).toBeGreaterThan(cable.d + 20);
    const pocket = holes(s, LED.rebate + 9).find((h) => Math.abs(h.w - LED.aaaL) < 0.8); // acima do canal do fio
    expect(pocket).toBeDefined();
    expect(pocket!.d).toBeCloseTo(LED.aaaW, 0);
  });

  test("fita de LED: canal com a largura da fita e o comprimento do encaixe", () => {
    const { base } = buildLedBase(M, { ...P, led: "strip", ledSize: 10 });
    const cav = holes(solid(base), LED.rebate + 6.5).find((h) => h.d < 20)!;
    expect(cav.d).toBeCloseTo(10 + 2 * LED.cavityClear, 0);
    expect(cav.w).toBeGreaterThan(100); // o comprimento do encaixe
  });
});

describe("base redonda do abajur e tampa (#101)", { timeout: 60_000 }, () => {
  const P = { layout: "round" as const, diameter: 80, wallT: 3, led: "disc" as const, ledSize: 50, power: "cable" as const };

  test("anel com sulco para a parede do cilindro (folga dos dois lados) e furo central aberto até o topo", () => {
    const { base, warnings } = buildLedBase(M, P);
    expect(warnings).toEqual([]);
    const s = solid(base);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    const b = size(base);
    expect(b.w).toBeCloseTo(80 + 12, 0); // diâmetro externo + 6 mm de cada lado
    // 2 mm abaixo do topo, dentro do sulco: o corte tem o furo central e o sulco entre duas paredes
    const cut = holes(s, LED.baseHeight - 2).map((h) => Math.round(h.w));
    expect(cut).toContain(Math.round(50 + 2 * LED.cavityClear)); // furo do disco
    const groove = Math.max(...cut);
    expect(groove).toBeCloseTo(80 + 2 * LED.fit, 0); // borda de fora do sulco
  });

  test("disco de LED maior que o vão do cilindro: avisa e limita o furo", () => {
    const { warnings } = buildLedBase(M, { ...P, ledSize: 90 });
    expect(warnings.join()).toMatch(/disco.*cabe|cabe.*cilindro/i);
  });

  test("com pilha, a base ganha o rabicho do compartimento atrás", () => {
    const plain = size(buildLedBase(M, P).base);
    const pod = size(buildLedBase(M, { ...P, power: "battery" }).base);
    expect(pod.d).toBeGreaterThan(plain.d + 25);
    expect(pod.w).toBeCloseTo(plain.w, 0);
  });

  test("tampa do abajur: disco do diâmetro do cilindro com colar que entra por dentro, com folga", () => {
    const lid = buildLid(M, { diameter: 80, wallT: 3 });
    const s = solid(lid);
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    const b = size(lid);
    expect(b.w).toBeCloseTo(80, 0);
    const collar = s.slice(LED.lidT + 1).bounds();
    expect((collar.max[0] - collar.min[0]) / 2).toBeCloseTo(40 - 3 - LED.lidClear, 0); // raio de dentro do cilindro menos a folga
    expect(b.b.min[2]).toBeCloseTo(0, 3);
  });
});
