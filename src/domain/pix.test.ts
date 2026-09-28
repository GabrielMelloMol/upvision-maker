import { describe, expect, test } from "vitest";
import { crc16, normalizePixKey, parseTlv, pixPayload } from "./pix";

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  test("vetor padrão '123456789' = 29B1", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("pixPayload", () => {
  test("reproduz o exemplo estático do Manual de Padrões do Pix (BCB)", () => {
    const p = pixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA" });
    expect(p).toBe("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D");
  });

  test("com valor e txid: campos 54 e 62-05, CRC confere", () => {
    const p = pixPayload({ key: "fulano@exemplo.com", name: "Ana", city: "São Paulo", amount: 15.9, txid: "PED123" });
    const f = parseTlv(p);
    expect(f["54"]).toBe("15.90");
    expect(parseTlv(f["62"])["05"]).toBe("PED123");
    expect(parseTlv(f["26"])).toEqual({ "00": "br.gov.bcb.pix", "01": "fulano@exemplo.com" });
    expect(f["60"]).toBe("SAO PAULO");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  test("remove acentos, corta nome em 25 e cidade em 15 caracteres", () => {
    const f = parseTlv(pixPayload({ key: "+5511987654321", name: "Confeitaria Três Corações da Vovó", city: "São José dos Campos" }));
    expect(f["59"]).toBe("Confeitaria Tres Coracoes");
    expect(f["60"]).toBe("SAO JOSE DOS CA");
  });

  test("valida entradas com mensagens em português", () => {
    const base = { key: "fulano@exemplo.com", name: "Ana", city: "Rio" };
    expect(() => pixPayload({ ...base, key: " " })).toThrow("chave Pix");
    expect(() => pixPayload({ ...base, name: "" })).toThrow("nome");
    expect(() => pixPayload({ ...base, city: "" })).toThrow("cidade");
    expect(() => pixPayload({ ...base, amount: -1 })).toThrow("valor");
    expect(() => pixPayload({ ...base, amount: 0 })).toThrow("valor");
    expect(() => pixPayload({ ...base, txid: "tem espaço" })).toThrow("identificador");
  });
});

describe("normalizePixKey", () => {
  test.each([
    ["123.456.789-09", "12345678909"],
    ["11.222.333/0001-81", "11222333000181"],
    ["(11) 98765-4321", "+5511987654321"],
    ["+55 11 98765-4321", "+5511987654321"],
    ["Fulano@Exemplo.COM", "fulano@exemplo.com"],
    ["123E4567-E12B-12D1-A456-426655440000", "123e4567-e12b-12d1-a456-426655440000"],
  ])("%s → %s", (input, out) => {
    expect(normalizePixKey(input)).toBe(out);
  });
});

describe("validação da chave", () => {
  test("CPF/CNPJ com dígito verificador errado é recusado (evita Pix para a pessoa errada)", () => {
    const base = { name: "Ana", city: "Rio" };
    expect(() => pixPayload({ ...base, key: "123.456.789-00" })).toThrow("CPF");
    expect(() => pixPayload({ ...base, key: "11.222.333/0001-80" })).toThrow("CNPJ");
    expect(() => pixPayload({ ...base, key: "não é chave" })).toThrow("chave Pix");
  });
});
