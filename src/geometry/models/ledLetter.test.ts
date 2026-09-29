import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { buildLedLetter, DEFAULT_LED_LETTER as D, type LedLetterParams } from "./ledLetter";
import { splitToBed } from "./splitBed";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// "fonte" de teste: cada letra vira um bloco 0,6·h × h, com 0,2·h de espaço entre letras
const ctx = (): ModelCtx => ({
  M,
  art: null,
  text: (s, h) => {
    const n = s.trim().length;
    if (!n) return null;
    const w = 0.6 * h, gap = 0.2 * h, total = n * w + (n - 1) * gap;
    return M.CrossSection.union(Array.from({ length: n }, (_, i) => M.CrossSection.square([w, h], true).translate([-total / 2 + w / 2 + i * (w + gap), 0])));
  },
});
const build = (p: Partial<LedLetterParams> = {}) => buildLedLetter(ctx(), { ...D, ...p });
const named = (ms: Model[], prefix: string) => ms.filter((m) => m.name.startsWith(prefix));
const size = (m: Model) => {
  const b = modelsBounds([m])!;
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
};
function expectPrintable(models: Model[]) {
  for (const m of models)
    for (const q of m.parts) {
      const s = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: q.mesh.positions, triVerts: q.mesh.indices }));
      expect(s.status()).toBe("NoError");
      expect(volume(q.mesh)).toBeGreaterThan(0);
      expect(meshBounds([q.mesh])!.min[2]).toBeGreaterThanOrEqual(-1e-4);
      s.delete();
    }
}

describe("letra caixa para LED (#49)", { timeout: 30_000 }, () => {
  test("face rente: caixa oca com fundo, furo do fio e difusor que encaixa com folga", () => {
    const { models } = build({ height: 120 });
    expectPrintable(models);
    expect(models.map((m) => m.name)).toEqual(["Caixa 1", "Difusor 1"]);
    const [w, h, z] = size(models[0]);
    expect([w, h, z].map(Math.round)).toEqual([72, 120, D.depth]);
    const [dw, dh, dz] = size(models[1]);
    expect(dw).toBeCloseTo(72 - 2 * (D.wall + D.clearance), 0);
    expect(dh).toBeCloseTo(120 - 2 * (D.wall + D.clearance), 0);
    expect(dz).toBeCloseTo(D.diffuser);
    // oca: bem menos que o bloco cheio
    expect(volume(models[0].parts[0].mesh)).toBeLessThan(72 * 120 * D.depth * 0.3);
  });

  test("palavra: uma caixa por letra, no lugar; retroiluminada tem face fechada e espaçadores", () => {
    const word = build({ text: "OI", height: 100 }).models;
    expect(named(word, "Caixa").map((m) => m.name)).toEqual(["Caixa 1", "Caixa 2"]);
    const halo = build({ style: "halo", height: 120 }).models;
    expectPrintable(halo);
    expect(halo.map((m) => m.name)).toEqual(["Caixa 1"]);
    expect(size(halo[0])[2]).toBeCloseTo(D.depth + D.standoff); // espaçadores passam do fundo
  });

  test("tampa elevada e face dupla", () => {
    const raised = build({ style: "raised", height: 120 }).models;
    expectPrintable(raised);
    expect(raised.map((m) => m.name)).toEqual(["Caixa 1", "Tampa 1"]);
    expect(size(raised[1])[0]).toBeCloseTo(72, 0); // cobre a parede
    const dbl = build({ style: "double", height: 120 }).models;
    expect(dbl.map((m) => m.name)).toEqual(["Caixa 1", "Difusor 1", "Difusor 1"]);
  });

  test("maior que a mesa: a caixa sai em partes que cabem; nome sobreposto vira peça", () => {
    const { models, warnings } = build({ height: 400, overlay: "Ana" });
    expect(named(models, "Caixa 1.").length).toBeGreaterThan(1);
    for (const m of named(models, "Caixa")) expect(Math.max(size(m)[0], size(m)[1])).toBeLessThanOrEqual(256);
    expect(warnings!.join(" ")).toMatch(/partes para colar/);
    expect(models.at(-1)!.parts[0].name).toBe("Nome");
  });

  test("fita larga demais para o traço avisa", () => {
    const thin = buildLedLetter({ ...ctx(), art: M.CrossSection.square([10, 100], true) }, { ...D, height: 100 }); // miolo de 6 mm
    expect(thin.warnings!.join(" ")).toMatch(/fita de 8 mm não passa/);
    expect(build({ height: 200, stripWidth: 8 }).warnings!.join(" ")).not.toMatch(/não passa/);
  });
});

test("splitToBed: corta só o necessário e conserva o volume", { timeout: 30_000 }, () => {
  const box = M.Manifold.cube([400, 100, 10]);
  const parts = splitToBed(M, box, 256);
  expect(parts).toHaveLength(2);
  expect(parts.reduce((s, q) => s + q.volume(), 0)).toBeCloseTo(400 * 100 * 10, 0);
  expect(splitToBed(M, M.Manifold.cube([100, 100, 10]), 256)).toHaveLength(1);
});
