import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { setFits } from "../../geometry/fits";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import type { ModelCtx } from "../../geometry/models/common";
import { DEFAULT_SCREW_CASE } from "../../geometry/models/screwCase";
import { DEFAULT_SCREEN, earOf } from "../../geometry/thermo/screen";
import { thermoDefaults } from "../../geometry/thermo/build";
import { COUPONS, type FitKey } from "../../geometry/testKit/catalog";
import { MODELS } from "./defs";
import type { Params } from "./fields";

let M: ManifoldToplevel;
let ctx: ModelCtx;
beforeAll(async () => {
  M = await getManifold();
  ctx = { M, art: null, artLayers: null, text: () => null };
});
afterEach(() => setFits(null));

const def = (id: string) => MODELS.find((m) => m.id === id)!;
/** Os valores de partida como a tela monta: o catálogo mais o que depende do app agora (as folgas validadas). */
const startParams = (id: string): Params => ({ ...def(id).defaults, ...(def(id).liveDefaults?.() ?? {}) });
/** Volume de tudo que o modelo gera: muda quando uma folga muda a geometria. */
const volumeOf = (id: string, p: Params): number =>
  def(id)
    .build(ctx, p)
    .models.flatMap((m) => m.parts)
    .reduce((v, part) => v + M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices })).volume(), 0);

/** [modelo, chave do kit, parâmetro do modelo que a chave preenche, valor lançado, padrão de fábrica]. */
const CASES: [string, FitKey, string, number, number][] = [
  ["screwCase", "threadClearance", "clearance", 0.5, 0.35],
  ["aroma", "threadClearance", "clearance", 0.5, 0.35],
  ["cupHandle", "cupClearance", "clearance", 0.8, 0.5],
  ["boardBox", "boardClearance", "clearance", 0.8, 0.5],
  ["phoneCase", "phoneClearance", "clearance", 0.3, 0.15],
  ["candyMold", "candyClearance", "clearance", 0.6, 0.4],
  ["spurGear", "gearBacklash", "backlash", 0.4, 0.2],
  ["planetary", "gearBacklash", "backlash", 0.4, 0.25],
  ["organizerBox", "hingeClearance", "hingeClearance", 0.5, 0.3],
  ["organizerBox", "latchReach", "latchReach", 1.6, 1.2],
];

describe("as ferramentas leem a folga validada no Kit de testes (#247)", { timeout: 120_000 }, () => {
  test.each(CASES)("%s: sem lançar nada vale o padrão; com %s = %s o modelo abre com ele e a geometria muda", (id, key, param, value, fallback) => {
    expect(startParams(id)[param], "sem folga lançada").toBe(fallback);
    const before = volumeOf(id, startParams(id));
    setFits({ [key]: value });
    expect(startParams(id)[param], "com a folga lançada").toBe(value);
    expect(Math.abs(volumeOf(id, startParams(id)) - before), "o volume do modelo muda").toBeGreaterThan(1e-3);
    setFits(null);
    expect(volumeOf(id, startParams(id))).toBeCloseTo(before, 6); // voltar ao padrão restaura o modelo
  });

  test("uma folga lançada não mexe nos outros parâmetros nem nos outros modelos", () => {
    setFits({ cupClearance: 0.8 });
    expect(startParams("cupHandle").clearance).toBe(0.8);
    expect(startParams("boardBox").clearance).toBe(0.5);
    expect(startParams("organizerBox").hingeClearance).toBe(0.3);
    expect({ ...startParams("cupHandle"), clearance: 0.5 }).toEqual({ ...def("cupHandle").defaults });
  });

  test("a trava e a dobradiça: o furo do pino e o gancho mudam de verdade (só a peça que usa o valor muda)", () => {
    const base = volumeOf("organizerBox", startParams("organizerBox"));
    const onlyHinge = volumeOf("organizerBox", { ...startParams("organizerBox"), hingeClearance: 0.5 });
    const onlyLatch = volumeOf("organizerBox", { ...startParams("organizerBox"), latchReach: 1.6 });
    expect(onlyHinge).toBeLessThan(base); // furo maior = menos plástico nas orelhas e nos nós
    expect(onlyLatch).toBeGreaterThan(base); // gancho mais fundo = mais plástico no dente
  });

  test("clipe da caixinha: o furo da orelha nasce com o valor validado e a orelha perde área", () => {
    expect(thermoDefaults().screen.hole).toBe(DEFAULT_SCREEN.hole);
    const area = (hole: number) => {
      const sil = M.CrossSection.circle(30, 64);
      const ear = earOf(M, sil, { ...DEFAULT_SCREEN, hole }, (o) => o);
      return ear.area();
    };
    const before = area(thermoDefaults().screen.hole);
    setFits({ clipHole: 4 });
    expect(thermoDefaults().screen.hole).toBe(4);
    expect(area(thermoDefaults().screen.hole)).toBeLessThan(before);
  });

  test("toda chave do kit tem uma ferramenta que a lê (nenhuma folga lançada fica sem efeito)", () => {
    const readers = new Set<string>([...CASES.map((c) => c[1]), "clipHole"]);
    for (const c of COUPONS) expect(readers.has(c.fitKey), c.fitKey).toBe(true);
    expect(DEFAULT_SCREW_CASE.clearance).toBe(0.35);
  });
});
