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

/** Legenda sob a miniatura da variação (#181): cabe numa linha só nos 100 px do botão, sem quebrar nem cortar. */
const MAX_VARIANT_LABEL = 14;

test("legendas das variações são curtas e padronizadas: até 14 letras, sem parênteses, começando em maiúscula e sem repetir na família (#181)", () => {
  const bad: string[] = [];
  for (const f of FAMILIES) {
    if (f.variants.length < 2 && !f.tools?.length) continue; // só mostra o seletor com 2 variações ou um atalho
    const seen = new Set<string>();
    for (const v of f.variants) {
      const l = v.label;
      if (l.length > MAX_VARIANT_LABEL) bad.push(`${f.id}/${v.id}: "${l}" tem ${l.length} letras (máx. ${MAX_VARIANT_LABEL})`);
      if (/[()]/.test(l)) bad.push(`${f.id}/${v.id}: "${l}" tem parênteses`);
      if (!/^\p{Lu}|^\d/u.test(l)) bad.push(`${f.id}/${v.id}: "${l}" não começa em maiúscula`);
      if (l !== l.trim() || /\.$/.test(l)) bad.push(`${f.id}/${v.id}: "${l}" com espaço ou ponto sobrando`);
      if (seen.has(l.toLowerCase())) bad.push(`${f.id}/${v.id}: "${l}" repetida na família`);
      seen.add(l.toLowerCase());
    }
  }
  for (const f of FAMILIES)
    for (const t of f.tools ?? []) if (t.label.length > MAX_VARIANT_LABEL || /[()]/.test(t.label)) bad.push(`${f.id}/atalho ${t.page}: "${t.label}" longo demais ou com parênteses`);
  expect(bad).toEqual([]);
});

test("categorias dos Modelos prontos (onde fica): Presentes, Casa e decoração e Organização e utilidades", () => {
  const names = (c: Parameters<typeof familiesIn>[0]) => familiesIn(c).map((f) => f.label);
  expect(CATEGORIES.map(([, label]) => label)).toEqual(["Chaveiros", "Placas", "Presentes e lembrancinhas", "Festa e esporte", "Casa e decoração", "Organização e utilidades", "Cozinha"]);
  expect(names("gifts")).toEqual(["Mapa estelar", "Cartão de música", "Lembrancinhas", "Porta-copos", "Marca-página"]);
  expect(familiesIn("gifts").find((f) => f.id === "souvenirs")!.variants.map((v) => v.id)).toEqual(["fridgeMagnet", "shirtPrint", "outlineBowl"]);
  expect(names("home")).toEqual(["Moldura", "Luminárias e abajures", "Quadro e desenho", "Vaso", "Brinquedos"]);
  expect(names("organize")).toEqual(["Potes e organizadores", "Organizador modular (Gridfinity)", "Suporte de celular e tablet", "Tecla de teclado", "Porta-chave de parede", "Utilitários"]);
  // nenhuma categoria ficou grande demais para achar as coisas
  for (const [c] of CATEGORIES) expect(familiesIn(c).reduce((n, f) => n + f.variants.length, 0), c).toBeLessThanOrEqual(20);
});

test("os nomes de cada ferramenta de Criar continuam levando a ela: os ids das telas antigas não somem", async () => {
  const pages = await import("../../pages");
  const redirects = (pages as { PAGE_REDIRECTS?: Record<string, string> }).PAGE_REDIRECTS ?? {};
  const OLD = ["svg", "cutter", "keychain", "medal", "extrude", "qr", "models", "spools", "lithophane", "pixel", "drawer", "toolfit", "colorsplit", "owndecal", "scad", "search3d", "ai", "projects"];
  const known = new Set(pages.PAGES.map((p) => p.id));
  expect(OLD.filter((id) => !known.has(id) && !(id in redirects))).toEqual([]);
});
