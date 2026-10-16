import { describe, expect, test } from "vitest";
import { bytesLabel, certificateJson, certificatePayload, groupedHash, normalizeHash, parseCertificateJson, parsePayload, proofCode, sha256Hex, verify, type Certificate } from "./fileProof";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"; // SHA-256 de "abc" (FIPS 180-2)
const bytes = (s: string) => new TextEncoder().encode(s);
const cert = (over: Partial<Certificate> = {}): Certificate => ({ version: 1, sha256: ABC, name: "gato.stl", size: 1234, at: "2026-10-15T17:30:00.000Z", author: "Loja da Ana", title: "Gato sentado", contact: "ana@loja.com", note: "", ...over });

describe("prova de integridade de arquivo (#228)", () => {
  test("SHA-256: vetores conhecidos (abc, vazio) e muda com um byte", async () => {
    expect(await sha256Hex(bytes("abc"))).toBe(ABC);
    expect(await sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(await sha256Hex(bytes("abd"))).not.toBe(ABC);
  });

  test("o hash aceita maiúsculas, espaços, hífens e o prefixo sha256:", () => {
    const spaced = ABC.toUpperCase().match(/.{8}/g)!.join(" ");
    expect(normalizeHash(spaced)).toBe(ABC);
    expect(normalizeHash(`sha256:${ABC}`)).toBe(ABC);
    expect(normalizeHash(`SHA-256: ${ABC.match(/.{4}/g)!.join("-")}`)).toBe(ABC);
    expect(normalizeHash(ABC.slice(0, 63))).toBeNull();
    expect(normalizeHash(`${ABC.slice(0, 63)}z`)).toBeNull();
    expect(normalizeHash("")).toBeNull();
  });

  test("código curto e hash em grupos de 8, em duas linhas", () => {
    expect(proofCode(ABC)).toBe("BA78-16BF-8F01");
    const lines = groupedHash(ABC, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ").replace(/ /g, "")).toBe(ABC);
    expect(lines[0].split(" ")).toHaveLength(4);
  });

  test("QR: leva o hash, a data e o nome e volta igual; QR de outra coisa não é certificado", () => {
    const text = certificatePayload(cert({ name: "linha1\nlinha2.stl" }));
    expect(text.split("\n")).toHaveLength(4); // o nome não quebra o formato
    expect(parsePayload(text)).toEqual({ sha256: ABC, at: "2026-10-15T17:30:00.000Z", name: "linha1 linha2.stl" });
    expect(parsePayload("https://exemplo.com")).toBeNull();
    expect(parsePayload("UPVISION-CERT/1\nsha256:123")).toBeNull();
  });

  test("certificado em JSON: volta igual; versão errada, hash inválido e lixo são recusados", () => {
    const c = cert();
    expect(parseCertificateJson(certificateJson(c))).toEqual(c);
    expect(parseCertificateJson(certificateJson({ ...c, sha256: ABC.toUpperCase() }))?.sha256).toBe(ABC);
    expect(parseCertificateJson(JSON.stringify({ ...c, version: 2 }))).toBeNull();
    expect(parseCertificateJson(JSON.stringify({ ...c, sha256: "abc" }))).toBeNull();
    expect(parseCertificateJson("não é json")).toBeNull();
  });

  test("conferência: igual confere; diferente diz que o arquivo mudou; hash malformado explica", () => {
    expect(verify(ABC, ABC.toUpperCase())).toEqual({ ok: true });
    const other = verify(ABC, "0".repeat(64));
    expect(other.ok).toBe(false);
    expect(!other.ok && other.reason).toMatch(/mudou|outro arquivo/);
    const bad = verify(ABC, "123");
    expect(!bad.ok && bad.reason).toMatch(/64 letras e números/);
  });

  test("tamanhos legíveis", () => {
    expect(bytesLabel(900)).toBe("900 bytes");
    expect(bytesLabel(2048)).toBe("2,0 KB");
    expect(bytesLabel(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});
