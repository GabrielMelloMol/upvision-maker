import { describe, expect, test, vi } from "vitest";
import { formatLine, sanitize, tail } from "./log";

describe("sanitize (sem dados pessoais no registro)", () => {
  test.each([
    ["falhou para ana.souza@gmail.com", "falhou para <e-mail>"],
    ["CPF 123.456.789-09 inválido", "CPF <documento> inválido"],
    ["cnpj 11222333000181", "cnpj <documento>"],
    ["telefone (21) 98888-1111", "telefone <telefone>"],
    ["+5521988881111 não responde", "<telefone> não responde"],
    ["chave sk-ant-api03-AbC_123-xyz recusada", "chave <chave-api> recusada"],
    ["C:\\Users\\Ana Souza\\OneDrive\\backup.json sem permissão", "C:\\Users\\<usuário>\\OneDrive\\backup.json sem permissão"],
    ["/Users/ana/Library/x.db travado", "/Users/<usuário>/Library/x.db travado"],
    ["/home/ana/.local/x", "/home/<usuário>/.local/x"],
    ["chave pix 123e4567-e12b-12d1-a456-426655440000", "chave pix <id>"],
  ])("%s", (input, out) => {
    expect(sanitize(input)).toBe(out);
  });

  test("mantém o que ajuda a entender o erro", () => {
    expect(sanitize("TypeError: Cannot read properties of undefined (reading 'x') at Calculator.tsx:42")).toBe(
      "TypeError: Cannot read properties of undefined (reading 'x') at Calculator.tsx:42",
    );
    expect(sanitize("Pedido #12 falhou em 28/09/2026 às 15:30, R$ 1.234,50")).toBe("Pedido #12 falhou em 28/09/2026 às 15:30, R$ 1.234,50");
  });
});

describe("formatLine / tail", () => {
  test("uma linha: data ISO, nível, origem e mensagem sanitizada", () => {
    vi.setSystemTime(new Date("2026-09-28T18:00:00Z"));
    expect(formatLine("error", "toast", "Falhou para ana@x.com\nlinha 2")).toBe("2026-09-28T18:00:00.000Z [error] toast: Falhou para <e-mail> linha 2");
    vi.useRealTimers();
  });

  test("tail pega as últimas N linhas não vazias", () => {
    expect(tail("a\nb\n\nc\nd\n", 2)).toBe("c\nd");
    expect(tail("", 5)).toBe("");
  });
});
