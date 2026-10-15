import { describe, expect, test } from "vitest";
import { MODELS } from "../tools/models/defs";
import { fieldHelp } from "./fieldHelp";

describe("frase de ajuda dos campos de medida (#210)", () => {
  test("nome genérico dentro de seção de texto, logo ou furo ganha a frase do contexto", () => {
    expect(fieldHelp("Altura", "Textos")).toMatch(/letras/);
    expect(fieldHelp("Altura", "Linha 2")).toMatch(/letras/);
    expect(fieldHelp("Relevo", "Nome")).toMatch(/texto sobe/);
    expect(fieldHelp("Largura", "Logo e arte")).toMatch(/desenho/);
    expect(fieldHelp("Diâmetro", "Furo da argola")).toMatch(/furo/i);
    // fora desses contextos vale a definição neutra, que serve em qualquer tela
    expect(fieldHelp("Altura", "Tamanho e cores")).toBe("Medida de baixo para cima.");
    expect(fieldHelp("Altura")).not.toMatch(/impressora/);
  });

  test("seção que só mistura nome com outras coisas (Nome e medidas) não vira contexto de texto", () => {
    expect(fieldHelp("Espessura", "Nome e medidas")).not.toMatch(/letras/);
  });

  test("os nomes genéricos nunca citam a impressora nem dizem 'letras' fora de contexto de texto", () => {
    for (const d of MODELS)
      for (const s of d.sections)
        for (const f of s.fields) {
          if (f.kind !== "num" || f.hint) continue;
          const h = fieldHelp(f.label, s.title) ?? "";
          if (/^(Altura|Largura|Profundidade|Tamanho|Espessura|Comprimento|Diâmetro)$/.test(f.label)) expect(h, `${d.id}/${s.title}/${f.label}`).not.toMatch(/impressora/);
          if (/^(Altura|Largura|Tamanho|Espessura)$/.test(f.label) && !/^(linha|texto|nome|legenda)/i.test(s.title)) expect(h, `${d.id}/${s.title}/${f.label}`).not.toMatch(/letras/);
        }
  });
});
