import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { ModelCtx } from "../models/common";
import type { Mesh, Model } from "../types";
import { COUPONS, DEFAULT_INPUTS, couponOf, type CouponId } from "./catalog";
import { buildTestKit, couponModels, DEFAULT_KIT } from "./kit";
import { gearRadii, spurSpec } from "./gearTooth";
import { modelsBounds } from "../bounds";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  ctx = { M, art: null, artLayers: null, text: () => null };
});

const solid = (m: Mesh): Solid => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const parts = (m: Model) => m.parts.map((p) => solid(p.mesh));
const models = (id: CouponId) => couponModels(M, ctx, id, DEFAULT_INPUTS);
const center = (s: Solid) => {
  const b = s.boundingBox();
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
};

describe("kit de testes físicos (#247)", () => {
  test.each(COUPONS.map((c) => c.id))("%s: uma peça por número da varredura, todas válidas e com volume", (id) => {
    const ms = models(id);
    expect(ms.length).toBeGreaterThanOrEqual(couponOf(id).sweep.length);
    for (const m of ms) for (const s of parts(m)) {
      expect(s.status(), m.name).toBe("NoError");
      expect(s.volume(), m.name).toBeGreaterThan(5);
    }
  });

  test("anel do copo: o vão tem exatamente copo + 2 × folga", () => {
    const ms = models("cup");
    couponOf("cup").sweep.forEach((cl, i) => {
      const ring = parts(ms[i])[0];
      const rIn = DEFAULT_INPUTS.cupDiameter / 2 + cl;
      const free = M.Manifold.cylinder(14, rIn - 0.03, rIn - 0.03, 96);
      const wall = M.Manifold.cylinder(14, rIn + 0.03 + 1, rIn + 0.03 + 1, 96).subtract(M.Manifold.cylinder(14, rIn + 0.03, rIn + 0.03, 96));
      expect(ring.intersect(free).volume()).toBeLessThan(1e-3);
      expect(ring.intersect(wall).volume()).toBeGreaterThan(50);
    });
  });

  test("moldura da placa: a placa de verdade (com a folga) cabe e as bordas ficam na folga pedida", () => {
    const ms = models("board");
    couponOf("board").sweep.forEach((cl, i) => {
      const frame = parts(ms[i])[0];
      const board = M.Manifold.cube([DEFAULT_INPUTS.boardL, DEFAULT_INPUTS.boardW, 2], true).translate([0, 0, 1.5]);
      expect(frame.intersect(board).volume(), `moldura ${i + 1}`).toBeLessThan(1e-3);
      const tooBig = M.Manifold.cube([DEFAULT_INPUTS.boardL + 2 * cl + 0.4, DEFAULT_INPUTS.boardW + 2 * cl + 0.4, 2], true).translate([0, 0, 1.5]);
      expect(frame.intersect(tooBig).volume()).toBeGreaterThan(1);
    });
  });

  test("dobradiça: folhas soltas, com folga radial e axial em todas as direções", () => {
    const ms = models("hinge");
    couponOf("hinge").sweep.forEach((cl, i) => {
      const [a, b] = parts(ms[i]);
      expect(a.decompose(), "A").toHaveLength(1);
      expect(b.decompose(), "B").toHaveLength(1);
      expect(a.intersect(b).volume()).toBe(0);
      const d = cl * 0.9;
      for (const v of [[0, d, 0], [0, -d, 0], [0, 0, d], [0, 0, -d]] as const) expect(b.translate([...v]).intersect(a).volume(), `folga ${cl} em ${v}`).toBe(0);
      expect(b.translate([0.36, 0, 0]).intersect(a).volume(), "folga axial de 0,4").toBe(0);
    });
  });

  test("trava: o gancho entra no rebaixo sem encostar, e só o gancho de 1,2 e 1,6 passa da face do batente", () => {
    const ms = models("latch");
    couponOf("latch").sweep.forEach((r, i) => {
      const [a, b] = parts(ms[i]);
      const dx = b.boundingBox().min[0] - -22.2; // o B foi levado para ao lado do A
      const bHome = b.translate([-dx, 0, 0]);
      const flipped = a.rotate([0, 180, 0]).translate([0, 0, 33]); // A de cabeça para baixo, base por cima do batente
      expect(flipped.intersect(bHome).volume(), `gancho ${r}`).toBeLessThan(1e-3);
      // ponta do gancho: o ponto mais ao lado da lâmina, na altura do gancho (z de 6 a 9, com a A virada)
      const tipX = flipped.intersect(M.Manifold.cube([20, 20, 3.4], true).translate([-5, 0, 7.5])).boundingBox().min[0];
      const face = -2.2;
      if (r > 0.8) expect(tipX).toBeLessThan(face - 0.1);
      else expect(tipX).toBeGreaterThan(face - 0.15);
    });
  });

  test("engrenagens: montadas nos pinos, com o dente de uma no vão da outra, não se tocam", () => {
    const ms = models("gear");
    couponOf("gear").sweep.forEach((b, i) => {
      const [base, g1, g2] = parts(ms[i]);
      const r = gearRadii(spurSpec(12, 1.5, 20, b));
      const a = 18;
      const home = (g: Solid, x: number, turn: number) => {
        const c = center(g);
        return g.translate([-c[0], -c[1], 0]).rotate([0, 0, turn]).translate([x, 0, base.boundingBox().min[2] + 2]);
      };
      const A = home(g1, -a / 2, 0);
      const B = home(g2, a / 2, 180 / 12);
      expect(A.intersect(B).volume(), `jogo ${b}`).toBeLessThan(0.5);
      expect(r.ra).toBeCloseTo(10.5, 1);
    });
  });

  test("kit completo: 41 peças em mesas que cabem na impressora, separadas por filamento; sem cupom marcado não sai nada", () => {
    const out = buildTestKit(M, ctx, DEFAULT_KIT);
    expect(out.models).toHaveLength(41);
    expect(out.plates.map((p) => p.material)).toEqual(expect.arrayContaining(["PLA ou PETG", "PETG", "TPU 95A"]));
    // cada mesa cabe na mesa da impressora e tem um só filamento
    for (const p of out.plates) {
      const b = modelsBounds(p.models)!;
      expect(b.max[0] - b.min[0], p.title).toBeLessThanOrEqual(256);
      expect(b.max[1] - b.min[1], p.title).toBeLessThanOrEqual(256);
    }
    const tpu = out.plates.filter((p) => p.material === "TPU 95A");
    expect(tpu.flatMap((p) => p.models).every((m) => m.name.startsWith("Canto"))).toBe(true);
    const petg = out.plates.filter((p) => p.material === "PETG");
    expect(petg.flatMap((p) => p.models).every((m) => m.name.startsWith("Trava"))).toBe(true);
    expect(out.plates.map((p) => p.title)).toEqual(out.plates.map((p, i) => `Mesa ${i + 1} · ${p.material}`));
    expect(out.warnings.join(" ")).toContain("uma de cada vez");
    expect(out.warnings.join(" ")).toContain("TPU 95A");
    expect(out.warnings.join(" ")).toContain("PETG");
    const none = buildTestKit(M, ctx, { ...DEFAULT_KIT, selected: Object.fromEntries(COUPONS.map((c) => [c.id, false])) as never });
    expect(none.plates).toHaveLength(0);
    expect(none.warnings).toHaveLength(0);
    const one = buildTestKit(M, ctx, { ...DEFAULT_KIT, selected: { ...DEFAULT_KIT.selected, cup: false, board: false, phone: false, thread: false, candy: false, gear: false, hinge: false, latch: false } });
    expect(one.models).toHaveLength(6);
    expect(one.plates).toHaveLength(1);
  });
});
