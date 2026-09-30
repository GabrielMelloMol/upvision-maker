import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildVase, catmullRom, DEFAULT_VASE as D, maxOverhangDeg, parseProfile, type VaseParams } from "./vase";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: () => null });
const build = (p: Partial<VaseParams> = {}) => buildVase(ctx(), { ...D, ...p });
const mesh = (p: Partial<VaseParams> = {}) => build(p).models[0].parts[0].mesh;

test("parseProfile e Catmull-Rom: passa pelos pontos e é suave entre eles", () => {
  expect(parseProfile("40, 55;48 x 32")).toEqual([40, 55, 48, 32]);
  const ys = [30, 50, 40, 20];
  expect(catmullRom(ys, 0)).toBeCloseTo(30);
  expect(catmullRom(ys, 1 / 3)).toBeCloseTo(50);
  expect(catmullRom(ys, 1)).toBeCloseTo(20);
  const mid = catmullRom(ys, 1 / 6);
  expect(mid).toBeGreaterThan(30);
  expect(mid).toBeLessThan(50);
});

describe("vaso paramétrico (#92)", { timeout: 60_000 }, () => {
  test("espiral: sólido fechado na altura pedida, apoiado na mesa, largura pelo maior raio", () => {
    const m = mesh({ profile: "30, 30, 30, 30" });
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
    expect(s.status()).toBe("NoError");
    const b = meshBounds([m])!;
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(D.height);
    expect(b.max[0] - b.min[0]).toBeCloseTo(60, 0);
    expect(volume(m)).toBeCloseTo(Math.PI * 30 * 30 * D.height, -3); // cilindro
    s.delete();
  });

  test("paredes: oco com fundo; volume = casca", () => {
    const solid = volume(mesh({ profile: "30, 30, 30, 30" }));
    const hollow = volume(mesh({ profile: "30, 30, 30, 30", mode: "walls", wall: 2, bottom: 3 }));
    const expected = Math.PI * (30 * 30 - 28 * 28) * (D.height - 3) + Math.PI * 30 * 30 * 3;
    expect(hollow).toBeLessThan(solid * 0.2);
    expect(Math.abs(hollow / expected - 1)).toBeLessThan(0.02);
  });

  test("polígono e estrela mudam a seção; torção gira o topo", () => {
    const circle = volume(mesh({ profile: "30, 30, 30, 30" }));
    const hex = volume(mesh({ profile: "30, 30, 30, 30", shape: "polygon", sides: 6 }));
    // hexágono inscrito com o mesmo raio no vértice: área 3√3/2·r² < π·r²
    expect(hex / circle).toBeCloseTo((3 * Math.sqrt(3)) / 2 / Math.PI, 2);
    const star = volume(mesh({ profile: "30, 30, 30, 30", shape: "star", sides: 5, starDepth: 0.4 }));
    expect(star).toBeLessThan(circle * 0.85);
    // torção de 36° num pentágono: o topo gira meio lado, então a caixa em X muda
    const b0 = meshBounds([mesh({ profile: "30, 30, 30, 30", shape: "polygon", sides: 5 })])!;
    const bt = meshBounds([mesh({ profile: "30, 30, 30, 30", shape: "polygon", sides: 5, twist: 36 })])!;
    expect(Math.abs(bt.min[0] - b0.min[0])).toBeGreaterThan(1);
  });

  test("ondulação radial e vertical alteram o raio pela amplitude", () => {
    // maior distância ao eixo (a crista da onda não cai necessariamente no eixo X)
    const maxR = (p: Partial<VaseParams>) => {
      const pos = mesh({ profile: "30, 30, 30, 30", ...p }).positions;
      let r = 0;
      for (let i = 0; i < pos.length; i += 3) r = Math.max(r, Math.hypot(pos[i], pos[i + 1]));
      return r;
    };
    expect(maxR({})).toBeCloseTo(30, 1);
    expect(maxR({ wave: "radial", waveAmp: 4, waves: 6 })).toBeCloseTo(34, 1);
    expect(maxR({ wave: "vertical", waveAmp: 4, waves: 3 })).toBeCloseTo(34, 1);
  });

  test("perfil que abre de repente avisa o balanço; perfil curto dá erro", () => {
    expect(maxOverhangDeg([20, 20, 20, 20], 100)).toBe(0);
    expect(build({ profile: "10, 80, 80, 80", height: 60 }).warnings!.join(" ")).toMatch(/acima de 60°/);
    expect(build().warnings!.join(" ")).not.toMatch(/acima de 60°/);
    expect(() => build({ profile: "30, 40" })).toThrow(/4 a 8 raios/);
  });
});
