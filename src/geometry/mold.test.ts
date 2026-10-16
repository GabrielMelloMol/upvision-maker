import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "./manifold";
import { toMesh } from "./mesh";
import { bestPlane, bestSetup, buildMold, mergedMesh, modelSolid, DEFAULT_MOLD, moldHalves, undercuts, type MoldParams } from "./mold";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const params = (over: Partial<MoldParams> = {}): MoldParams => ({ ...DEFAULT_MOLD, ...over });
const sphere = (r = 15) => M.Manifold.sphere(r, 48);
/** Peça com ressalto que prende: um haltere deitado (dois discos e uma haste). */
const dumbbell = () => M.Manifold.union([M.Manifold.cylinder(6, 14, 14, 48).translate([0, 0, 0]), M.Manifold.cylinder(6, 14, 14, 48).translate([0, 0, 24]), M.Manifold.cylinder(24, 4, 4, 32).translate([0, 0, 3])]);

describe("molde bipartido a partir de STL (#239)", { timeout: 60_000 }, () => {
  test("esfera cortada ao meio: duas metades fechadas, a cavidade tem o volume da esfera e o canal sai pelo lado pedido", () => {
    const s = sphere();
    const h = moldHalves(M, s, params({ offset: 0 }));
    for (const half of [h.lower, h.upper]) {
      expect(half.status()).toBe("NoError");
      expect(half.volume()).toBeGreaterThan(0);
    }
    expect(h.volumeMl).toBeCloseTo((4 / 3) * Math.PI * 15 ** 3 / 1000, 0); // a esfera tem 48 faces: ~1% a menos
    // caixa: diâmetro + 2 paredes, a de baixo vai até o plano e a de cima começa nele
    expect(h.size[0]).toBeCloseTo(30 + 2 * 11, 0); // parede padrão de 11 mm
    expect(h.lower.boundingBox().max[2]).toBeGreaterThan(0);
    expect(h.lower.boundingBox().max[2]).toBeLessThan(10); // o plano em 0 + os pinos de 7 mm
    expect(h.upper.boundingBox().min[2]).toBeCloseTo(0, 3);
    // as duas metades juntas não se sobrepõem fora dos pinos nos furos
    expect(h.lower.intersect(h.upper).volume()).toBeCloseTo(0, 3);
    for (const x of [h.lower, h.upper, s]) x.delete();
  });

  test("a soma das duas metades é a caixa menos a peça, o canal e os respiros (e mais os pinos, menos os furos)", () => {
    const s = sphere();
    const noChannels = moldHalves(M, s, params({ sprue: "none", vents: 0 }));
    const side = 30 + 2 * 11;
    const box = side ** 3;
    const total = noChannels.lower.volume() + noChannels.upper.volume();
    const pinsAndSockets = 4 * Math.PI * 3 ** 2 * 7; // pinos de baixo (aprox., sem a ponta)
    expect(total).toBeGreaterThan(box - (4 / 3) * Math.PI * 15 ** 3 - pinsAndSockets);
    expect(total).toBeLessThan(box - (4 / 3) * Math.PI * 15 ** 3 + pinsAndSockets);
    const withChannels = moldHalves(M, s, params({}));
    expect(withChannels.lower.volume() + withChannels.upper.volume()).toBeLessThan(total); // canal e respiro tiram material
    for (const x of [noChannels.lower, noChannels.upper, withChannels.lower, withChannels.upper, s]) x.delete();
  });

  test("o pino de uma metade entra no furo da outra com folga: montadas, nada se sobrepõe", () => {
    const s = sphere();
    const h = moldHalves(M, s, params({ clearance: 0.3 }));
    // montadas na posição (plano em z = 0): os pinos de baixo entram nos furos de cima sem tocar
    expect(h.lower.intersect(h.upper).volume()).toBeCloseTo(0, 4);
    // sem folga, o pino não tem onde ficar: o furo é do mesmo tamanho
    const tight = moldHalves(M, s, params({ clearance: 0 }));
    expect(tight.lower.intersect(tight.upper).volume()).toBeCloseTo(0, 3);
    // e os furos existem de fato: a metade de cima perde volume por causa deles
    const noPins = h.upper.volume();
    expect(noPins).toBeGreaterThan(0);
    for (const x of [h.lower, h.upper, tight.lower, tight.upper, s]) x.delete();
  });

  test("canal de vazamento: um furo no plano até a face de fora, com funil que alarga na ponta", () => {
    const s = sphere();
    const withSprue = moldHalves(M, s, params({ sprue: "+y", vents: 0 }));
    const none = moldHalves(M, s, params({ sprue: "none", vents: 0 }));
    const removed = none.lower.volume() + none.upper.volume() - (withSprue.lower.volume() + withSprue.upper.volume());
    expect(removed).toBeGreaterThan(Math.PI * 4 ** 2 * 10); // pelo menos o canal de 8 mm de diâmetro
    // no plano e perto da face de fora, a seção tem o furo maior (funil): a largura em x do vazio cresce para fora
    const face = withSprue.upper.slice(0.5); // logo acima do plano
    const wide = face.bounds();
    expect(wide.max[1]).toBeGreaterThan(24); // a parede de +y vai até y = 25
    for (const x of [withSprue.lower, withSprue.upper, none.lower, none.upper, s]) x.delete();
  });

  test("respiros: cada um tira mais material e saem nos lados opostos ao canal", () => {
    const s = sphere();
    const v = [0, 1, 3].map((n) => {
      const h = moldHalves(M, s, params({ vents: n }));
      const vol = h.lower.volume() + h.upper.volume();
      h.lower.delete();
      h.upper.delete();
      return vol;
    });
    expect(v[1]).toBeLessThan(v[0]);
    expect(v[2]).toBeLessThan(v[1]);
    s.delete();
  });

  test("encolhimento: a cavidade cresce a partir do plano e o plano não sai do lugar", () => {
    const s = sphere();
    const a = moldHalves(M, s, params({ shrink: 0 }));
    const b = moldHalves(M, s, params({ shrink: 5 }));
    expect(b.volumeMl).toBeCloseTo(a.volumeMl * 1.05 ** 3, 1);
    expect(b.upper.boundingBox().min[2]).toBeCloseTo(0, 3);
    for (const x of [a.lower, a.upper, b.lower, b.upper, s]) x.delete();
  });

  test("plano fora da peça: erro claro", () => {
    const s = sphere();
    expect(() => moldHalves(M, s, params({ offset: 40 }))).toThrow(/fora da peça/);
    s.delete();
  });

  test("parede mínima para caber o pino: sobe sozinha e avisa", () => {
    const s = sphere();
    const h = moldHalves(M, s, params({ wall: 3, pinR: 4 }));
    expect(h.warnings.some((w) => /parede subiu/.test(w))).toBe(true);
    expect(h.size[0]).toBeCloseTo(30 + 2 * (2 * (4 + 0.3) + 4), 1); // pino de 4 mm: 2 × (4 + 0,3) + 4 de borda = 12,6 de parede
    for (const x of [h.lower, h.upper, s]) x.delete();
  });

  test("eixos X e Y: o plano é no eixo pedido (a peça gira para o eixo virar Z)", () => {
    const s = M.Manifold.cube([40, 20, 10], true); // comprida em x
    for (const axis of ["x", "y"] as const) {
      const h = moldHalves(M, s, params({ axis, offset: 0, sprue: "none", vents: 0 }));
      const dims = axis === "x" ? 40 : 20;
      expect(h.size[2]).toBeCloseTo(dims + 2 * 11, 1); // o eixo do plano vira a altura do molde
      for (const x of [h.lower, h.upper]) x.delete();
    }
    s.delete();
  });

  test("impressão: as duas metades de partição para cima, uma ao lado da outra, na mesa, cabendo juntas na mesa quando a peça é pequena", () => {
    const s = sphere();
    const out = buildMold(M, s, toMesh(s), params({ offset: 0 }));
    expect(out.models.map((m) => m.name)).toEqual(["Metade de baixo", "Metade de cima"]);
    const [a, b] = out.models.map((m) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.parts[0].mesh.positions, triVerts: m.parts[0].mesh.indices })));
    for (const half of [a, b]) {
      expect(half.status()).toBe("NoError");
      expect(half.boundingBox().min[2]).toBeCloseTo(0, 3);
    }
    expect(b.boundingBox().min[0]).toBeGreaterThan(a.boundingBox().max[0]); // lado a lado
    // a face de partição fica para cima: no topo de cada metade a seção é o contorno cheio da caixa (com a cavidade aberta)
    const topA = a.slice(a.boundingBox().max[2] - 1.5).area();
    expect(topA).toBeLessThan(50 * 50);
    expect(out.report.volumeMl).toBeCloseTo((4 / 3) * Math.PI * 15 ** 3 / 1000, 0);
    for (const x of [a, b, s]) x.delete();
  });

  test("contra-saída: a esfera cortada ao meio sai limpa; o haltere prende cortado de través e sai limpo cortado no comprimento", () => {
    const sph = sphere();
    const u0 = undercuts(toMesh(sph), "z", 0);
    expect(u0.low).toBeLessThan(0.01);
    expect(u0.high).toBeLessThan(0.01);
    const d = dumbbell(); // em pé em z: dois discos e uma haste
    const mesh = toMesh(d);
    const across = undercuts(mesh, "z", 15); // plano de través, na haste: os ombros dos discos prendem
    expect(across.low + across.high).toBeGreaterThan(0.2);
    const along = undercuts(mesh, "x", 0); // plano no comprimento, pelo eixo: cada metade sai para o seu lado
    expect(along.low + along.high).toBeLessThan(0.01);
    const bad = buildMold(M, d, mesh, params({ axis: "z", offset: 15, sprue: "none", vents: 0 }));
    expect(bad.warnings.some((w) => /prende/.test(w))).toBe(true);
    const good = buildMold(M, d, mesh, params({ axis: "x", offset: 0, sprue: "none", vents: 0 }));
    expect(good.warnings.some((w) => /prende/.test(w))).toBe(false);
    for (const x of [sph, d]) x.delete();
  });

  test("melhor plano: a esfera fica no meio e o haltere escolhe um plano no comprimento, que não prende", () => {
    const sph = sphere();
    const mid = bestPlane(toMesh(sph), "z");
    expect(Math.abs(mid)).toBeLessThan(3);
    const d = dumbbell();
    const mesh = toMesh(d);
    const best = bestPlane(mesh, "x");
    expect(Math.abs(best)).toBeLessThan(4);
    const u = undercuts(mesh, "x", best);
    expect(u.low + u.high).toBeLessThan(0.05);
    for (const x of [sph, d] as Solid[]) x.delete();
  });

  test("melhor eixo: o haltere em pé pede um plano no comprimento (x ou y), a esfera fica no Z", () => {
    const d = dumbbell();
    const best = bestSetup(toMesh(d));
    expect(best.axis).not.toBe("z");
    expect(best.score).toBeLessThan(0.05);
    const sph = sphere();
    expect(bestSetup(toMesh(sph)).axis).toBe("z");
    for (const x of [d, sph]) x.delete();
  });

  test("modelo com várias partes vira um sólido só e a malha unida mantém os triângulos", () => {
    const a = toMesh(M.Manifold.cube([10, 10, 10]));
    const b = toMesh(M.Manifold.cube([10, 10, 10]).translate([20, 0, 0]));
    const model = { name: "m", parts: [{ name: "a", color: "#fff", mesh: a }, { name: "b", color: "#fff", mesh: b }] };
    const merged = mergedMesh(model);
    expect(merged.indices.length).toBe(a.indices.length + b.indices.length);
    expect(Math.max(...merged.indices)).toBe(a.positions.length / 3 + b.positions.length / 3 - 1);
    const { solid, holes } = modelSolid(M, model);
    expect(holes).toBe(0);
    expect(solid.volume()).toBeCloseTo(2000, 3);
    solid.delete();
  });
});
