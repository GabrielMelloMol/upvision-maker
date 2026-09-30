import { beforeAll, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildRuler3d, DEFAULT_RULER as D, type RulerParams } from "./ruler3d";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.length, h], true) : null) });
const build = (p: Partial<RulerParams> = {}) => buildRuler3d(ctx(), { ...D, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

test("régua de 25 cm inteira cabe na A1, fina, com as marcas gravadas a cada mm (#140)", () => {
  const out = build();
  expect(out.models).toHaveLength(1);
  const m = out.models[0].parts[0].mesh;
  const b = meshBounds([m])!;
  expect(b.max[0] - b.min[0]).toBeCloseTo(250 + 2 * D.end, 1);
  expect(b.max[2] - b.min[2]).toBeCloseTo(D.thickness, 2);
  // o zero fica a `end` mm da ponta
  const s = solid(m);
  const x0 = b.min[0] + D.end;
  const at = (x: number) => {
    const cut = s.trimByPlane([1, 0, 0], x - 0.05).trimByPlane([-1, 0, 0], -(x + 0.05));
    const v = cut.volume();
    cut.delete();
    return v;
  };
  // longe dos números: a marca de 13 mm tira material; o meio entre marcas (13,5) não
  expect(at(x0 + 13)).toBeLessThan(at(x0 + 13.5) * 0.95);
  s.delete();
  expect(volume(m)).toBeLessThan(250 * D.width * D.thickness);
});

test("em 2 partes: metades que cabem numa mesa de 180 mm e se encaixam sem sobrepor", () => {
  const out = build({ split: true });
  expect(out.models.map((x) => x.name)).toEqual(["Régua (0 a 12,5 cm)", "Régua (12,5 a 25 cm)"]);
  for (const x of out.models) {
    const b = meshBounds(x.parts.map((p) => p.mesh))!;
    expect(b.max[0] - b.min[0]).toBeLessThan(180);
  }
  // montadas (sem o afastamento da mesa), as metades não se invadem
  const [a, c] = out.assembled!.map((x) => solid(x.parts[0].mesh));
  const hit = a.intersect(c);
  expect(hit.volume()).toBeLessThan(0.01);
  for (const s of [a, c, hit]) s.delete();
});
