// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { DEFAULT_KIT_CARD, buildKitCard, componentCount } from "../../geometry/models/kitCard";
import type { ManifoldToplevel } from "../../geometry/manifold";
import { getManifold } from "../../geometry/manifold";
import { designFromSvg } from "../designInput";
import { KIT_EXAMPLES, kitExampleFile } from "./kitExamples";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("exemplos do Kit card", () => {
  test.each(KIT_EXAMPLES.map((e) => [e.label, e] as const))("%s: uma figura só e o kit monta sem erro", async (_n, ex) => {
    const { cs } = await designFromSvg(ex.svg, 100, false, true);
    expect(componentCount(cs)).toBe(1);
    const out = buildKitCard({ M, art: cs, art2: null, text: () => null }, { ...DEFAULT_KIT_CARD, mode: ex.mode });
    expect(out.models.length).toBeGreaterThan(0);
  });
  test("o arquivo é um SVG com o nome do exemplo", async () => {
    const f = kitExampleFile(KIT_EXAMPLES[0]);
    expect(f.name).toBe("elephant.svg");
    expect(await f.text()).toContain("<svg");
  });
});
