import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildOpener } from "./opener";
import { buildPhoneKeychain, DEFAULT_PHONE_KEYCHAIN as D, type PhoneKeychainParams } from "./phoneKeychain";
import { STAND_CLEARANCE } from "./phoneStand";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const build = (p: Partial<PhoneKeychainParams> = {}) => buildPhoneKeychain(ctx(), { ...D, ...p });
const body = (p: Partial<PhoneKeychainParams> = {}) => build(p).models[0].parts[0].mesh;
const plain = (p: Partial<PhoneKeychainParams> = {}) => buildOpener(ctx(), { kind: "can", thickness: D.thickness, relief: D.relief, text: D.text, bodyColor: D.bodyColor, artColor: D.artColor, ...p }).models[0].parts[0].mesh;

describe("chaveiro suporte de celular com abridor de lata (#192)", { timeout: 60_000 }, () => {
  test("mesmo tamanho do abridor de lata, apoiado na mesa, com a arte em relevo por cima", () => {
    const out = build();
    const a = modelsBounds(out.models)!, o = meshBounds([plain()])!;
    expect(a.min[2]).toBeCloseTo(0);
    expect(a.max[2]).toBeCloseTo(D.thickness + D.relief);
    expect([a.min[0], a.max[0], a.min[1], a.max[1]].map((v) => Math.round(v))).toEqual([o.min[0], o.max[0], o.min[1], o.max[1]].map((v) => Math.round(v)));
    expect(out.models[0].parts.map((x) => x.name)).toEqual(["Abridor", "Arte"]);
  });

  test("a fenda tira volume do corpo na medida do aparelho (largura × fundo × largura da placa)", () => {
    const removed = volume(plain()) - volume(body());
    const width = D.deviceThickness + STAND_CLEARANCE;
    const tilt = ((90 - D.angle) * Math.PI) / 180;
    const bottomZ = 3 + (width / 2) * Math.sin(tilt);
    const depth = D.thickness - bottomZ;
    // no corte de lado a fenda é um paralelogramo: largura × comprimento ao longo do eixo (fundo / cos da inclinação)
    const area = (width * depth) / Math.cos(tilt);
    expect(removed / (area * 32)).toBeCloseTo(1, 1);
  });

  test("a placa continua inteira (um sólido) e o fundo da fenda nunca fica abaixo de 3 mm", () => {
    const m = body();
    const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
    expect(s.status()).toBe("NoError");
    expect(s.decompose().length).toBe(1);
    // fatia a 2,9 mm: a placa está cheia ali (só a fenda tira, e ela começa em 3)
    const low = s.slice(2.9).area(), floor = plainArea(2.9);
    expect(low).toBeCloseTo(floor, 0);
    s.delete();
  });

  test("ângulo maior deixa a fenda mais em pé: a abertura no topo fica mais estreita", () => {
    const topOpen = (angle: number) => {
      const m = body({ angle, thickness: 14 });
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
      const cs = s.slice(13.9);
      const a = cs.area();
      cs.delete();
      s.delete();
      return a;
    };
    expect(topOpen(75)).toBeGreaterThan(topOpen(55)); // mais inclinada = abertura mais larga no topo = sobra menos placa
  });

  test("avisos: aparelho grosso demais para o espaço livre e placa fina com fenda rasa", () => {
    expect(build({ deviceThickness: 24 }).warnings!.join(" ")).toMatch(/Aparelho grosso demais/);
    expect(build({ thickness: 8 }).warnings!.join(" ")).toMatch(/aumente a espessura da placa para/);
    expect(build().warnings!.join(" ")).toMatch(/inclinado 65° para o lado da argola/);
  });
});

function plainArea(z: number) {
  const m = plain();
  const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
  const cs = s.slice(z);
  const a = cs.area();
  cs.delete();
  s.delete();
  return a;
}
