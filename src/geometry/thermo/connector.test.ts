import { beforeAll, describe, expect, test, vi } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { scoped } from "../shape2d";
import { boltSolid, CONNECTOR_THREAD, connectorHole, connectorSpec, nutSolid } from "./connector";
import { threadedRod } from "./thread";

vi.setConfig({ testTimeout: 120_000 });

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("conector com porca", () => {
  test("a porca tem exatamente a folga de rosca pedida (Kit de testes): não pega com menos, pega com mais", () =>
    scoped((k) => {
      for (const clearance of [0.2, 0.35, 0.5]) {
        const c = connectorSpec(clearance, 2);
        const nut = k(nutSolid(M, k, c));
        // o parafuso dentro da porca, alinhado com a rosca dela (a rosca da porca começa no fundo)
        const rod = (grow: number) => k(k(threadedRod(M, k, c.nut.thread, grow)).translate([0, 0, c.nut.floor]));
        expect(k(nut.intersect(rod(clearance - 0.05))).volume()).toBeLessThan(1e-3);
        expect(k(nut.intersect(rod(clearance + 0.05))).volume()).toBeGreaterThan(0.1);
      }
    }));

  test("o furo da orelha deixa o parafuso passar com a folga pedida", () => {
    expect(connectorHole(0.35)).toBeCloseTo(2 * (CONNECTOR_THREAD.major + 0.35), 6);
  });

  test("o parafuso atravessa as duas orelhas e ainda entra 3 voltas na porca, sem bater no fundo dela", () =>
    scoped((k) => {
      const grip = 2; // duas telas de 1 mm
      const c = connectorSpec(0.35, grip);
      const bolt = k(boltSolid(M, k, c));
      const b = bolt.boundingBox();
      const shank = b.max[2] - c.headH; // do apoio da cabeça até a ponta
      expect(shank - grip).toBeGreaterThanOrEqual(3 * CONNECTOR_THREAD.pitch - 1e-6);
      // a rosca da porca é mais funda que a ponta que sobra: a porca aperta as orelhas antes de chegar ao fim
      expect(c.nut.thread.length).toBeGreaterThan(shank - grip);
      // a cabeça e a porca são maiores que o furo: seguram as orelhas
      expect(c.headR).toBeGreaterThan(connectorHole(0.35) / 2 + 1);
      const nb = k(nutSolid(M, k, c)).boundingBox();
      expect(nb.max[0] - nb.min[0]).toBeGreaterThan(connectorHole(0.35) + 2);
    }));

  test("parafuso e porca imprimem em pé, sem suporte: a base de cada um está em z = 0", () =>
    scoped((k) => {
      const c = connectorSpec(0.35, 2);
      expect(k(boltSolid(M, k, c)).boundingBox().min[2]).toBeCloseTo(0, 6);
      expect(k(nutSolid(M, k, c)).boundingBox().min[2]).toBeCloseTo(0, 6);
    }));
});
