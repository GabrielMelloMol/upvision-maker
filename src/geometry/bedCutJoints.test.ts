import { beforeAll, describe, expect, test } from "vitest";
import { buildJoint, numberSpot, type JointKind } from "./bedCutJoints";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const OPTS = { size: 0, clearance: 0.2, magnet: { d: 6, h: 2 }, room: 30 };

describe("encaixes do corte para a mesa: folgas (#218)", () => {
  test.each(["round", "square", "dovetail"] as JointKind[])("%s: a peça solta cabe inteira nos furos e sobra folga (os dois furos juntos são maiores que ela)", (kind) => {
    scoped((k) => {
      const sec = k(M.CrossSection.square([80, 60]).translate([0, 0]));
      const j = buildJoint(M, k, kind as Exclude<JointKind, "none" | "magnet">, sec, OPTS)!;
      expect(j).not.toBeNull();
      const holes = k(j.holeBelow.add(j.holeAbove));
      expect(k(j.key!.subtract(holes)).volume()).toBeCloseTo(0, 3); // nada da chave fica de fora do furo
      const gap = holes.volume() - j.key!.volume();
      expect(gap).toBeGreaterThan(0);
      // folga de 0,2 mm em volta + 0,4 mm de fundo: a diferença é pequena perto do volume da chave
      expect(gap).toBeLessThan(j.key!.volume() * 0.6);
    });
  });

  test("ímã: furo de 6,3 mm nos dois lados, sem peça solta", () => {
    scoped((k) => {
      const j = buildJoint(M, k, "magnet", k(M.CrossSection.square([80, 60])), OPTS)!;
      expect(j.key).toBeNull();
      const b = j.holeBelow.boundingBox();
      expect(b.max[0] - b.min[0]).toBeCloseTo(6.3, 1);
      expect(b.min[2]).toBeCloseTo(-2.3, 2); // 2 mm do ímã + 0,3 de folga
    });
  });

  test("face pequena demais: sem encaixe (null)", () => {
    scoped((k) => expect(buildJoint(M, k, "round", k(M.CrossSection.square([5, 5])), OPTS)).toBeNull());
  });

  test("o número cai longe do encaixe e dentro da face", () => {
    scoped((k) => {
      const sec = k(M.CrossSection.square([80, 60]));
      const j = buildJoint(M, k, "round", sec, OPTS)!;
      const spot = numberSpot(k, sec, j.footprint, 2.5)!;
      expect(Math.hypot(spot[0] - 40, spot[1] - 30)).toBeGreaterThan(j.size / 2 + 2); // fora do furo
      expect(spot[0]).toBeGreaterThan(3);
      expect(spot[0]).toBeLessThan(77);
    });
  });
});
