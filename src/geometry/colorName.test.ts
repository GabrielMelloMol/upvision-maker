import { describe, expect, test } from "vitest";
import { capitalized, colorName } from "./colorName";

describe("nome da cor em português", () => {
  test.each([
    ["#2563eb", "azul"],
    ["#c0392b", "vermelho"],
    ["#22a04b", "verde"],
    ["#d6a374", "bege"],
    ["#14532d", "verde-escuro"],
    ["#0a0a0a", "preto"],
    ["#ffffff", "branco"],
    ["#facc15", "amarelo"],
    ["#f01010", "vermelho"],
  ])("%s é %s", (hex, nome) => expect(colorName(hex)).toBe(nome));

  test("primeira letra maiúscula para começar frase", () => expect(capitalized("azul-claro")).toBe("Azul-claro"));
});
