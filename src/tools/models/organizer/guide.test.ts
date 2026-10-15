import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../../../geometry/manifold";
import { buildOrganizerBox } from "../../../geometry/models/organizerBox";
import { dimsOf, type OrganizerParams } from "../../../geometry/models/organizer/params";
import { cellsOf, stripsOf } from "../../../geometry/models/organizer/layout";
import { ORGANIZER_BOX_MODEL } from "../catalog/organizerBox";
import { validParams } from "../defs";
import { ORGANIZER_PRESETS } from "./guide";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("sugestões por uso da caixa organizadora (#204)", { timeout: 120_000 }, () => {
  test("são 9, com nome, frase e todos os campos dentro das faixas do formulário", () => {
    expect(ORGANIZER_PRESETS.map((p) => p.label)).toEqual(["Ferragens", "Parafusos longos", "Parafusos 5×4", "Pequena 3×2", "Componentes 8×5", "Funda 4×3", "Bandeja sem tampa", "Bijuteria 6×4", "Linhas e agulhas"]);
    for (const p of ORGANIZER_PRESETS) {
      expect(p.blurb.length).toBeGreaterThan(20);
      expect(validParams(ORGANIZER_BOX_MODEL, p.patch), p.label).toBe(true);
    }
  });
  for (const preset of ORGANIZER_PRESETS)
    test(`${preset.label}: gera sem erro e a soma dos nichos fecha com o vão`, () => {
      const p = preset.patch as unknown as OrganizerParams;
      const out = buildOrganizerBox({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) }, p);
      expect(out.models.length).toBeGreaterThan(0);
      const d = dimsOf(p);
      for (const row of cellsOf(stripsOf(p), d.innerW, d.innerD, p.divider)) {
        const sum = row.reduce((a, c) => a + (c.x1 - c.x0), 0) + (row.length - 1) * p.divider;
        expect(Math.abs(sum - d.innerW)).toBeLessThan(0.01);
      }
    });
});
