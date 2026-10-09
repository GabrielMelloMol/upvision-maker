import { describe, expect, test } from "vitest";
import { MODELS } from "./defs";
import { MODEL_ALIASES, matchesAll, modelScore, searchModels, toolText } from "./search";
import { familyOf } from "./families";
import { PAGES } from "../../pages";
import { PAGE_ALIASES } from "../../ui/pageAliases";

/** O que a vendedora digita → o que precisa aparecer em primeiro (#onde-fica). */
const FIRST: [string, string][] = [
  ["ímã", "fridgeMagnet"], ["geladeira", "fridgeMagnet"], ["ima de geladeira", "fridgeMagnet"],
  ["abajur", "tableLamp"], ["luminária", "lamp"], ["luminaria", "lamp"], ["camisa", "shirtPrint"], ["camiseta", "shirtPrint"],
  ["dado", "rpgDice"], ["RPG", "rpgDice"], ["d20", "rpgDice"], ["porta-copos", "coaster"], ["porta copos", "coaster"], ["copo", "coaster"],
  ["tecla", "keycap"], ["teclado", "keycap"], ["vaso", "vase"], ["mapa estelar", "starMap"], ["constelação", "starMap"], ["céu", "starMap"],
  ["porta-retrato", "photoHolder"], ["porta retrato", "photoHolder"], ["porta-chaves", "keyHolder"], ["letreiro", "layeredSign"],
  ["troféu", "trophy"], ["shadowbox", "shadowbox"], ["boleira", "cakeStand"], ["topo de bolo", "cake"], ["marca página", "bookmark"], ["marcador de livro", "bookmark"],
];

describe("busca dos Modelos prontos", () => {
  test.each(FIRST)("%s acha %s em primeiro", (q, id) => {
    expect(searchModels(q)[0], q).toBe(id);
  });

  test("as ocasiões acham os modelos da coleção: Dia das Mães, Natal, aniversário, casamento", () => {
    expect(searchModels("Dia das Mães")).toEqual(expect.arrayContaining(["starMap", "spinner", "mirror", "cake", "lamp"]));
    expect(searchModels("natal")).toEqual(expect.arrayContaining(["snowflake", "ornamentSpinner", "spinner"]));
    expect(searchModels("aniversário")).toEqual(expect.arrayContaining(["cake", "starMap", "rpgDice"]));
    expect(searchModels("casamento")).toEqual(expect.arrayContaining(["starMap", "layeredSign"]));
  });

  test("várias palavras, em qualquer ordem, e hífen não atrapalha", () => {
    expect(searchModels("copos porta")).toContain("coaster");
    expect(searchModels("celular suporte")).toEqual(expect.arrayContaining(["phoneStand", "phoneKeychain"]));
    expect(searchModels("zzzz nada")).toEqual([]);
  });

  test("o nome certo vem antes de quem só cita a palavra na descrição", () => {
    const ima = searchModels("ímã");
    expect(ima.indexOf("fridgeMagnet")).toBe(0);
    expect(modelScore("fridgeMagnet", "ímã")).toBeLessThan(modelScore("musicCard", "ímã")!);
    const quadro = searchModels("quadro");
    expect(quadro.slice(0, 3).some((id) => ["cutoutFrame", "goalBoard", "shadowbox"].includes(id))).toBe(true);
  });

  test("todo sinônimo aponta para um modelo que existe", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    expect(Object.keys(MODEL_ALIASES).filter((id) => !ids.has(id))).toEqual([]);
  });

  test("busca vazia não acha nada; sem busca, a Criar mostra tudo", () => {
    expect(searchModels("  ")).toEqual([]);
    expect(matchesAll("qualquer coisa", "")).toBe(true);
  });
});

describe("busca das ferramentas e das telas", () => {
  const find = (q: string) => PAGES.filter((p) => p.section === "create" && matchesAll(toolText(p.id, p.label, p.blurb), q)).map((p) => p.id);

  test("termos do dia a dia levam à ferramenta certa", () => {
    expect(find("foto em relevo")).toContain("lithophane");
    expect(find("litofania")).toContain("lithophane");
    expect(find("gaveta")).toEqual(expect.arrayContaining(["drawer", "toolfit"]));
    expect(find("adesivo")).toContain("owndecal");
    expect(find("vetorizar")).toContain("svg");
    expect(find("thingiverse")).toContain("search3d");
    expect(find("pixel art ímã")).toContain("pixel");
  });

  test("todo sinônimo de tela aponta para uma tela que existe", () => {
    const ids = new Set(PAGES.map((p) => p.id));
    expect(Object.keys(PAGE_ALIASES).filter((id) => !ids.has(id))).toEqual([]);
  });

  test("a família de cada modelo achado existe (a galeria abre nela)", () => {
    for (const id of searchModels("natal")) expect(familyOf(id).variants.some((v) => v.id === id)).toBe(true);
  });
});
