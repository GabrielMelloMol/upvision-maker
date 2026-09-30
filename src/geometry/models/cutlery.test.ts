import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Mesh } from "../types";
import { buildRails, buildRailTest, buildTray, railProfileAt } from "./cutlery";
import { cutleryPlan } from "./cutleryPlan";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));

describe("talheres em 2 andares: bandeja e trilhos (#140)", { timeout: 60_000 }, () => {
  test("bandeja de talheres: medida da plano, 4 divisões com fundo, alças nas pontas", () => {
    const plan = cutleryPlan({ width: 500, depth: 500, height: 110 });
    const t = plan.trays[0];
    const m = buildTray(M, t, plan.trayDepth, plan.trayHeight, "#2563eb").parts[0].mesh;
    const b = meshBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(t.width, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(plan.trayDepth, 1);
    expect(b.max[2] - b.min[2]).toBeCloseTo(plan.trayHeight, 1);
    const s = solid(m);
    // um corte a meia altura, no meio da profundidade, mostra as 4 divisões (5 paredes = 5 ilhas ligadas pelo fundo não contam)
    const mid = s.slice(plan.trayHeight / 2).decompose().length;
    expect(mid).toBeGreaterThanOrEqual(1);
    // fundo cheio: a fatia logo acima do chão é quase o retângulo inteiro
    expect(s.slice(0.5).area()).toBeGreaterThan(0.95 * t.width * plan.trayDepth);
    // alça: no topo da parede da frente há um recorte
    const topFront = s.slice(plan.trayHeight - 0.5).area();
    const lowFront = s.slice(plan.trayHeight - 15).area();
    expect(topFront).toBeLessThan(lowFront);
    s.delete();
  });

  test("trilhos: perfil em U de lado na mesa, altura do andar de baixo, pedaços de até 250 com furo de pino", () => {
    const plan = cutleryPlan({ width: 500, depth: 500, height: 110 });
    const rails = buildRails(M, 500, plan.lowerHeight, "#1c1c1e");
    expect(rails.length).toBeGreaterThanOrEqual(4); // 2 lados × 2 pedaços
    for (const r of rails) {
      const b = modelsBounds([r])!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(250.01);
      expect(b.min[2]).toBeCloseTo(0, 2);
    }
    // perfil: a largura do U é a altura do andar de baixo
    const p = railProfileAt(plan.lowerHeight);
    expect(p.span).toBeCloseTo(plan.lowerHeight, 3);
    // cada lado soma o comprimento todo
    const lengths = rails.map((r) => {
      const b = modelsBounds([r])!;
      return b.max[0] - b.min[0];
    });
    expect(lengths.reduce((a, c) => a + c, 0)).toBeCloseTo(2 * (500 - 2), 0);
    for (const r of rails) expect(volume(r.parts[0].mesh)).toBeGreaterThan(0);
  });

  test("gaveta alta: trilhos e peça de teste cabem na mesa, sem cortar o trilho na altura (#148)", () => {
    const plan = cutleryPlan({ width: 500, depth: 500, height: 400 });
    const rails = buildRails(M, 500, plan.lowerHeight, "#1c1c1e");
    expect(rails).toHaveLength(4);
    for (const m of [...rails, ...buildRailTest(M, plan.lowerHeight, "#2563eb")]) {
      const b = modelsBounds([m])!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(256);
    }
  });

  test("peça de teste do trilho: um pedaço curto do trilho e um canto da bandeja", () => {
    const out = buildRailTest(M, 60, "#2563eb");
    expect(out.map((m) => m.name)).toEqual(["Teste do trilho", "Canto da bandeja"]);
  });
});
