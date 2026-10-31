import { expect, test } from "vitest";
import { PAGES } from "../../pages";
import { CATEGORIES } from "./defs";
import { searchHits } from "./createSearch";
import { FAMILIES } from "./families";
import { FILE_TOOL_GROUPS, FILE_TOOLS, PRODUCT_BLURB, PRODUCTS, productPages, TABS, toolTab, typesOf } from "./products";

/** Páginas da Criar que não são ferramenta: a própria Criar, os Modelos prontos (o editor) e Meus projetos. */
const NOT_TOOLS = new Set(["create", "models", "projects"]);
const createTools = () => PAGES.filter((p) => p.section === "create" && !NOT_TOOLS.has(p.id)).map((p) => p.id);

test("nenhuma ferramenta da Criar fica só em 'Tudo': cada uma é entrada de um produto OU está num grupo de arquivo, e só num", () => {
  const inProducts = productPages();
  const orphans = createTools().filter((id) => !inProducts.has(id) && !FILE_TOOLS.includes(id));
  expect(orphans, "ferramentas sem aba (ponha num produto em products.ts ou num FILE_TOOL_GROUPS)").toEqual([]);
  const both = createTools().filter((id) => inProducts.has(id) && FILE_TOOLS.includes(id));
  expect(both, "ferramenta em dois lugares").toEqual([]);
  expect(FILE_TOOLS.filter((id) => !PAGES.some((p) => p.id === id))).toEqual([]); // grupo apontando para tela que não existe
  expect(FILE_TOOLS).toHaveLength(14);
});

test("nenhuma família nem produto fica sem aba: toda categoria tem aba, e toda família e produto tem categoria e frase", () => {
  const tabs = new Set(TABS.map(([t]) => t));
  for (const [c] of CATEGORIES) expect(tabs.has(c), `categoria ${c} sem aba`).toBe(true);
  for (const g of FILE_TOOL_GROUPS) expect(tabs.has(g.tab), g.id).toBe(true);
  for (const p of PRODUCTS) {
    expect(tabs.has(p.category), `${p.id} sem aba`).toBe(true);
    expect(p.entries.length, p.id).toBeGreaterThan(0);
    expect(p.blurb.length, `${p.id} sem frase do que resolve`).toBeGreaterThan(10);
  }
  for (const f of FAMILIES) expect(PRODUCT_BLURB[f.id], `família ${f.id} sem frase`).toBeTruthy();
  expect(FAMILIES.every((f) => PRODUCTS.some((p) => p.id === f.id))).toBe(true);
  for (const id of createTools()) {
    const where = [toolTab(id), PRODUCTS.find((p) => p.entries.some((e) => e.kind === "tool" && e.page === id))?.category];
    expect(where.some(Boolean), `${id} sem aba`).toBe(true);
  }
});

test("os cartões dizem quantos tipos têm; produto de um tipo só não diz nada", () => {
  expect(typesOf(PRODUCTS.find((p) => p.id === "keychain")!)).toBe("13 tipos");
  expect(typesOf(PRODUCTS.find((p) => p.id === "cake")!)).toBeNull();
});

/** Busca: o que a pessoa digita acha o que ela quer em até 5 resultados (as palavras soltas, como foto e nome, têm vários bons resultados). */
const WANT: [query: string, expected: (h: ReturnType<typeof searchHits>[number]) => boolean][] = [
  ["pix", (h) => h.entry.kind === "model" && h.entry.id === "pix"],
  ["placa pix", (h) => h.entry.kind === "model" && h.entry.id === "pix"],
  ["topo de bolo", (h) => h.entry.kind === "model" && h.entry.id === "cake"],
  ["lembrancinha", (h) => h.product?.id === "souvenirs"],
  ["anilha", (h) => h.entry.kind === "model" && h.entry.id === "gymKeychain"],
  ["dividir stl", (h) => h.entry.kind === "tool" && h.entry.page === "bedcut"],
  ["molde", (h) => (h.entry.kind === "tool" && h.entry.page === "mold") || h.product?.id === "stamps" || h.product?.id === "cutters"],
  ["caixinha", (h) => h.product?.id === "thermoform" || h.product?.id === "gridfinity" || h.product?.id === "containers"],
  ["nome", (h) => h.entry.kind === "tool" && h.entry.page === "keychain"],
  ["foto", (h) => h.product?.id === "lithophane" || (h.entry.kind === "tool" && h.entry.page === "lithophane")],
  ["litofania", (h) => h.product?.id === "lithophane"],
  ["chaveiro com nome", (h) => h.entry.kind === "tool" && h.entry.page === "keychain"],
  ["cortador de biscoito", (h) => h.entry.kind === "tool" && h.entry.page === "cutter"],
  ["medalha", (h) => h.product?.id === "medal"],
  ["caixinha termoformada", (h) => h.product?.id === "thermoform"],
];
test.each(WANT)("busca '%s' acha o que a pessoa quer entre os 5 primeiros", (q, ok) => {
  const hits = searchHits(q).slice(0, 5);
  expect(hits.some(ok), hits.map((h) => `${h.product?.id}/${h.entry.kind === "model" ? h.entry.id : h.entry.page}`).join(", ")).toBe(true);
});
