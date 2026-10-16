import { describe, expect, test } from "vitest";
import { MODELS } from "../defs";
import { FAMILIES } from "../families";
import { VARIANTS } from "../variants";
import { FAMILY_HELP } from "./familyHelp";
import { guideFor, variantPresets } from "./resolve";

describe("ajuda e sugestões em todos os modelos (#209)", () => {
  test("toda família tem 'Como usar' escrito (quando usar, quando não, dicas e perguntas)", () => {
    const missing = FAMILIES.filter((f) => !FAMILY_HELP[f.id]).map((f) => f.id);
    expect(missing).toEqual([]);
    for (const [id, h] of Object.entries(FAMILY_HELP)) {
      expect(h.use.length, id).toBeGreaterThan(0);
      expect(h.avoid.length, id).toBeGreaterThan(0);
      expect(h.tips.length, id).toBeGreaterThan(0);
      expect(h.faq.length, id).toBeGreaterThan(0);
      for (const q of h.faq) expect(q.a.length, `${id}: ${q.q}`).toBeGreaterThan(20);
    }
  });

  test("todo modelo resolve um guia com ajuda; as variações viram sugestões com frase", () => {
    for (const def of MODELS) {
      const g = guideFor(def, VARIANTS[def.id] ?? []);
      expect(g.help.use.length, def.id).toBeGreaterThan(0);
      expect(g.presets.length, def.id).toBe(def.guide ? def.guide.presets.length : (VARIANTS[def.id] ?? []).length);
      for (const p of g.presets) expect(p.blurb.length, `${def.id}/${p.label}`).toBeGreaterThan(10);
    }
  });

  test("a caixa organizadora mantém o guia próprio e as variações ganham frase padrão", () => {
    const box = MODELS.find((m) => m.id === "organizerBox")!;
    expect(guideFor(box, []).presets).toHaveLength(9);
    const [first] = variantPresets([{ label: "Casamento", patch: { a: 1 } }, { label: "X", patch: {}, blurb: "Frase própria" }]);
    expect(first.blurb).toMatch(/Casamento/);
    expect(variantPresets([{ label: "X", patch: {}, blurb: "Frase própria" }])[0].blurb).toBe("Frase própria");
  });
});
