import { describe, expect, test } from "vitest";
import { lookupCep } from "./cep";
import { CompanyInput, CustomerInput, DEFAULT_COMPANY, EMPTY_CUSTOMER, formatDocument } from "./customers";

describe("cliente", () => {
  test("aceita cliente mínimo (só nome)", () => {
    expect(CustomerInput.parse({ ...EMPTY_CUSTOMER, name: "Ana" }).name).toBe("Ana");
  });

  test("valida CPF/CNPJ e e-mail quando preenchidos", () => {
    expect(() => CustomerInput.parse({ ...EMPTY_CUSTOMER, name: "Ana", document: "111.111.111-11" })).toThrow(/CPF/);
    expect(CustomerInput.parse({ ...EMPTY_CUSTOMER, name: "Ana", document: "529.982.247-25" }).document).toBe("52998224725");
    expect(CustomerInput.parse({ ...EMPTY_CUSTOMER, kind: "pj", name: "Loja", document: "11.222.333/0001-81" }).document).toBe("11222333000181");
    expect(() => CustomerInput.parse({ ...EMPTY_CUSTOMER, name: "Ana", email: "ana@" })).toThrow();
    expect(() => CustomerInput.parse({ ...EMPTY_CUSTOMER, name: "Ana", discountPct: 120 })).toThrow();
  });

  test("formata documento para exibir", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("")).toBe("");
  });
});

describe("empresa", () => {
  test("chave Pix é validada e normalizada; vazia é permitida", () => {
    expect(CompanyInput.parse({ ...DEFAULT_COMPANY, pixKey: "" }).pixKey).toBe("");
    expect(CompanyInput.parse({ ...DEFAULT_COMPANY, pixKey: "529.982.247-25" }).pixKey).toBe("52998224725");
    expect(() => CompanyInput.parse({ ...DEFAULT_COMPANY, pixKey: "123" })).toThrow(/Pix/);
  });

  test("logo precisa ser imagem em data URL", () => {
    expect(() => CompanyInput.parse({ ...DEFAULT_COMPANY, logo: "javascript:alert(1)" })).toThrow();
    expect(CompanyInput.parse({ ...DEFAULT_COMPANY, logo: "data:image/png;base64,AAAA" }).logo).toContain("data:image/png");
  });
});

describe("CEP (ViaCEP)", () => {
  const fake = (body: unknown, ok = true) => async () => ({ ok, json: async () => body }) as Response;

  test("preenche endereço", async () => {
    const r = await lookupCep("01310-100", fake({ logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" }));
    expect(r).toEqual({ street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo", uf: "SP" });
  });

  test("CEP inválido ou inexistente dá erro claro", async () => {
    await expect(lookupCep("123", fake({}))).rejects.toThrow(/8 números/);
    await expect(lookupCep("99999999", fake({ erro: true }))).rejects.toThrow(/não encontrado/);
  });
});
