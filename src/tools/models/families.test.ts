import { expect, test } from "vitest";
import { PAGES } from "../../pages";
import { CATEGORIES, MODELS } from "./defs";
import { carryFields, FAMILIES, familiesIn, familyOf, modelOf, variantLabel } from "./families";

test("cada modelo aparece em exatamente uma família; nenhuma variação aponta para modelo que não existe (#141)", () => {
  const ids = FAMILIES.flatMap((f) => f.variants.map((v) => v.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids].sort()).toEqual(MODELS.map((m) => m.id).sort());
  expect(FAMILIES.length).toBeGreaterThanOrEqual(24);
  expect(FAMILIES.length).toBeLessThanOrEqual(32);
});

test("famílias por categoria cobrem todas as categorias; atalhos apontam para telas que existem", () => {
  for (const [c] of CATEGORIES) expect(familiesIn(c).length).toBeGreaterThan(0);
  const pages = new Set(PAGES.map((p) => p.id));
  for (const f of FAMILIES) for (const t of f.tools ?? []) expect(pages.has(t.page), `${f.id} → ${t.page}`).toBe(true);
});

test("o id antigo cai na família certa, com o rótulo curto da variação", () => {
  expect(familyOf("gymKeychain").label).toBe("Chaveiro");
  expect(variantLabel("gymKeychain")).toBe("Anilha");
  expect(familyOf("ledLetter").id).toBe("letters");
});

test("trocar de variação leva texto e cores com o mesmo nome; número e escolhas ficam como estavam", () => {
  const from = modelOf("trophy"), to = modelOf("trophyElegant");
  const fromParams = { ...from.defaults, title: "Campeã 2026", accentColor: "#ff0000" };
  const out = carryFields(from, fromParams, to, { ...to.defaults });
  const shared = to.sections.flatMap((s) => s.fields).filter((f) => ["text", "color"].includes(f.kind)).map((f) => f.k);
  const common = shared.filter((k) => from.sections.flatMap((s) => s.fields).some((f) => f.k === k));
  expect(common.length).toBeGreaterThan(0); // os dois troféus têm texto em comum
  for (const k of common) expect(out[k]).toBe(fromParams[k as keyof typeof fromParams]);
  expect(common.some((k) => out[k] !== to.defaults[k])).toBe(true);
  // campos numéricos do destino não mudam
  for (const f of to.sections.flatMap((s) => s.fields)) if (f.kind === "num") expect(out[f.k]).toBe(to.defaults[f.k]);
});
