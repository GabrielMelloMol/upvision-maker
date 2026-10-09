import { describe, expect, test } from "vitest";
import { rank, type SearchItem } from "./search";

const item = (title: string, extra: Partial<SearchItem> = {}): SearchItem => ({ id: title, title, group: "Telas", pageId: "x", ...extra });

describe("rank", () => {
  const items = [item("Calculadora"), item("Cortador de biscoito"), item("PLA Preto", { subtitle: "Voolt", group: "Filamentos" }), item("Preferências"), item("Pedir à IA")];

  test("sem acento e sem caixa: 'pref' acha Preferências", () => {
    expect(rank(items, "pref").map((i) => i.title)).toEqual(["Preferências"]);
  });
  test("todas as palavras precisam aparecer (título, subtítulo ou palavras-chave)", () => {
    expect(rank(items, "pla voolt").map((i) => i.title)).toEqual(["PLA Preto"]);
    expect(rank(items, "ia pedir").map((i) => i.title)).toEqual(["Pedir à IA"]);
  });
  test("começo do título vem antes de trecho no meio", () => {
    expect(rank([item("Biscoito decorado"), item("Cortador de biscoito")], "bisc").map((i) => i.title)).toEqual(["Biscoito decorado", "Cortador de biscoito"]);
  });
  test("a palavra inteira vem antes do começo de outra: 'pix' acha Placa Pix antes de Pixel art", () => {
    expect(rank([item("Pixel art"), item("Placa Pix")], "pix").map((i) => i.title)).toEqual(["Placa Pix", "Pixel art"]);
  });
  test("hífen não atrapalha: 'porta copos' acha Porta-copos", () => {
    expect(rank([item("Porta-copos"), item("Porta-chave")], "porta copos").map((i) => i.title)).toEqual(["Porta-copos"]);
  });
  test("busca vazia devolve tudo, na ordem", () => {
    expect(rank(items, "  ")).toHaveLength(items.length);
  });
});
