// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { applyOwnCurved, type SurfaceSpot } from "../tools/models/applyOwn";
import { newArtLayer, type Layer } from "../tools/models/layers";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { volume } from "./testUtil";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const BAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 10"><rect width="50" height="10"/></svg>';
const layer = (p: Partial<Layer> = {}): Layer => ({ ...newArtLayer(BAR, "faixa", null), x: 0, y: 0, width: 100, mode: "raised", depth: 0.8, color: "#d6262e", ...p });
const model = (s: ReturnType<ManifoldToplevel["Manifold"]["cube"]>): Model => ({ name: "Peça", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(s) }] });
const cup = () => model(M.Manifold.cylinder(90, 35, 35, 160).subtract(M.Manifold.cylinder(90, 32.6, 32.6, 160).translate([0, 0, 3])));
const side: SurfaceSpot = { part: 0, point: [35, 0, 45], normal: [1, 0, 0], wrap: "z" };
const radial = (m: Model, cx = 0, cy = 0) => {
  const p = m.parts[1].mesh.positions;
  const r: number[] = [], ang: number[] = [], z: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    r.push(Math.hypot(p[i] - cx, p[i + 1] - cy));
    ang.push((Math.atan2(p[i + 1] - cy, p[i] - cx) * 180) / Math.PI);
    z.push(p[i + 2]);
  }
  return { r, ang, z };
};

describe("Enrolar o desenho na curva (#245)", { timeout: 180_000 }, () => {
  test("faixa de 100 × 20 mm num copo de raio 35: dá a volta (163,7°), tem 20 mm de altura e o relevo acompanha o cilindro", async () => {
    const out = await applyOwnCurved(cup(), side, [layer()], M);
    expect(out.warnings).toEqual([]);
    const { r, ang, z } = radial(out.models[0]);
    expect(Math.min(...r)).toBeGreaterThan(34.5); // não entra na peça
    expect(Math.max(...r)).toBeLessThan(35.81); // 0,8 mm de relevo
    expect(Math.max(...ang) - Math.min(...ang)).toBeCloseTo((100 / 35) * (180 / Math.PI), 0); // 100 mm de arco, sem esticar nem encolher
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(20, 0);
    const v = volume(out.models[0].parts[1].mesh);
    expect(v).toBeGreaterThan(100 * 20 * 0.8 * 0.96); // área verdadeira × altura do relevo
    expect(v).toBeLessThan(100 * 20 * 0.8 * 1.06);
  });

  test("a mesma faixa na projeção reta não cabe (passa de 70 mm de diâmetro) e avisa; enrolada, não avisa nada", async () => {
    const reta = await applyOwnCurved(cup(), { ...side, wrap: undefined }, [layer()], M);
    expect(reta.warnings.join(" ")).toMatch(/sai da peça|inclinado/);
    const enrolada = await applyOwnCurved(cup(), side, [layer()], M);
    expect(enrolada.warnings).toEqual([]);
  });

  test("mais larga que a volta: avisa que as pontas se encontram", async () => {
    const out = await applyOwnCurved(cup(), side, [layer({ width: 230 })], M);
    expect(out.warnings.join(" ")).toMatch(/mais largo que a volta/);
  });

  test("cone (raio 40 embaixo, 20 em cima): a altura do desenho é medida ao longo da parede, não na vertical", async () => {
    const cone = model(M.Manifold.cylinder(60, 40, 20, 160));
    const slope = Math.atan2(20, 60); // 18,4°
    const spot: SurfaceSpot = { part: 0, point: [30, 0, 30], normal: [Math.cos(slope), 0, Math.sin(slope)], wrap: "z" };
    const out = await applyOwnCurved(cone, spot, [layer({ width: 60 })], M);
    expect(out.warnings).toEqual([]);
    const { z, r } = radial(out.models[0]);
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(12 * Math.cos(slope), 0); // 60 de largura → 12 de altura na parede, 11,4 na vertical
    expect(r.every((x) => x > 19 && x < 41.5)).toBe(true);
  });

  test("esfera, enrolando em torno do eixo X: o desenho segue o meridiano e não passa dos polos", async () => {
    const ball = model(M.Manifold.sphere(30, 96));
    const out = await applyOwnCurved(ball, { part: 0, point: [0, 0, 30], normal: [0, 0, 1], wrap: "x" }, [layer({ width: 50 })], M);
    expect(out.warnings).toEqual([]);
    const p = out.models[0].parts[1].mesh.positions;
    let rMin = Infinity;
    for (let i = 0; i < p.length; i += 3) rMin = Math.min(rMin, Math.hypot(p[i], p[i + 1], p[i + 2]));
    expect(rMin).toBeGreaterThan(29.4); // acompanha a esfera de raio 30
  });

  test("eixo deitado (copo de lado, eixo X do arquivo): funciona igual", async () => {
    const lying = model(M.Manifold.cylinder(90, 35, 35, 160).subtract(M.Manifold.cylinder(90, 32.6, 32.6, 160).translate([0, 0, 3])).rotate([0, 90, 0]));
    const out = await applyOwnCurved(lying, { part: 0, point: [45, 0, 35], normal: [0, 0, 1], wrap: "x" }, [layer()], M);
    expect(out.warnings).toEqual([]);
    const p = out.models[0].parts[1].mesh.positions;
    let [rMin, rMax] = [Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i + 1], p[i + 2]);
      [rMin, rMax] = [Math.min(rMin, r), Math.max(rMax, r)];
    }
    expect(rMin).toBeGreaterThan(34.5);
    expect(rMax).toBeLessThan(35.9);
  });

  test("gravado e embutido também enrolam: o volume tirado ≈ área × profundidade e o embutido devolve a cor", async () => {
    const v0 = volume(cup().parts[0].mesh);
    const eng = await applyOwnCurved(cup(), side, [layer({ mode: "engraved", depth: 0.6 })], M);
    expect(v0 - volume(eng.models[0].parts[0].mesh)).toBeGreaterThan(100 * 20 * 0.6 * 0.94);
    expect(v0 - volume(eng.models[0].parts[0].mesh)).toBeLessThan(100 * 20 * 0.6 * 1.06);
    const inl = await applyOwnCurved(cup(), side, [layer({ mode: "inlay", depth: 0.6 })], M);
    expect(volume(inl.models[0].parts[0].mesh) + volume(inl.models[0].parts[1].mesh)).toBeCloseTo(v0, -1);
  });

  test("face plana ou eixo que não serve: cai na projeção reta e explica", async () => {
    const box = model(M.Manifold.cube([60, 60, 40], false));
    const flat = await applyOwnCurved(box, { part: 0, point: [60, 30, 20], normal: [1, 0, 0], wrap: "z" }, [layer({ width: 30 })], M);
    expect(flat.warnings[0]).toMatch(/^Enrolar: .*Usei a projeção reta\./);
    const wrong = await applyOwnCurved(cup(), { ...side, wrap: "x" }, [layer({ width: 30 })], M);
    expect(wrong.warnings[0]).toMatch(/^Enrolar:/);
  });

  test("o mapa não estica: um quadrado de 20 mm enrolado mede 20 mm de arco na volta e 20 mm no sentido do eixo", async () => {
    const SQ = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const out = await applyOwnCurved(cup(), { ...side, point: [35, 0, 45] }, [layer({ svg: SQ, width: 20 })], M);
    const { ang, z } = radial(out.models[0]);
    expect((Math.max(...ang) - Math.min(...ang)) * (Math.PI / 180) * 35).toBeCloseTo(20, 0);
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(20, 0);
  });

  test("eixo errado numa garrafa (deitada em X): as outras fatias não fecham o círculo e cai na projeção reta com o motivo", async () => {
    const prof: [number, number][] = [[0, 0]];
    for (let z = 0; z <= 100; z += 2) prof.push([33, z]);
    for (let z = 102; z <= 140; z += 2) prof.push([33 - (20 * (1 - Math.cos(((z - 100) / 40) * Math.PI))) / 2, z]);
    for (let z = 142; z <= 180; z += 2) prof.push([13, z]);
    prof.push([0, 180]);
    const bottle = model(new M.CrossSection([prof], "NonZero").revolve(128));
    const spot: SurfaceSpot = { part: 0, point: [33, 0, 50], normal: [1, 0, 0] };
    const certo = await applyOwnCurved(bottle, { ...spot, wrap: "z" }, [layer({ width: 90 })], M);
    expect(certo.warnings).toEqual([]);
    // no ombro (z = 120, raio 23) o corte pelo eixo X é só o perfil curvo, que parece um círculo perto do ponto: as outras fatias denunciam
    const ombro: SurfaceSpot = { part: 0, point: [0, 23, 120], normal: [0, 0.8, 0.6], wrap: "x" };
    const errado = await applyOwnCurved(bottle, ombro, [layer({ width: 30 })], M);
    expect(errado.warnings[0]).toMatch(/^Enrolar: .*Usei a projeção reta\./);
    const aponta = await applyOwnCurved(bottle, { ...spot, wrap: "x" }, [layer({ width: 30 })], M);
    expect(aponta.warnings[0]).toMatch(/^Enrolar: O eixo escolhido aponta para o ponto/);
  });
});
