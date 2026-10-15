import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import type { Certificate } from "../domain/fileProof";
import { A4, type PdfFonts } from "./doc";
import { fileCertificatePdf } from "./fileCertificate";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
const fonts: PdfFonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
const SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const cert: Certificate = { version: 1, sha256: SHA, name: "gato-sentado.stl", size: 2_516_582, at: "2026-10-15T17:30:00.000Z", author: "Loja da Ana", title: "Gato sentado", contact: "ana@loja.com", note: "Peça exclusiva" };

test("certificado: uma página A4 com obra, autor, arquivo, hash em duas linhas, código e avisos de limite", async () => {
  const { bytes, trace } = await fileCertificatePdf(fonts, cert);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  expect([width, height]).toEqual([expect.closeTo(A4.w, 1), expect.closeTo(A4.h, 1)]);
  expect(trace).toEqual(expect.arrayContaining(["Certificado de integridade de arquivo", "Código BA78-16BF-8F01", "Gato sentado", "Loja da Ana", "ana@loja.com", "gato-sentado.stl", "Peça exclusiva"]));
  expect(trace).toContain("ba7816bf 8f01cfea 414140de 5dae2223"); // hash em grupos de 8, linha 1
  expect(trace).toContain("b00361a3 96177a9c b410ff61 f20015ad"); // linha 2
  expect(trace).toContain(SHA); // o hash inteiro, para os testes e para busca no texto
  const text = trace.join(" ");
  expect(text).toMatch(/não é um carimbo de tempo independente/); // o limite fica escrito
  expect(text).toMatch(/Conferir um arquivo/);
  expect(text).toMatch(/2,4 MB/);
});

test("campos em branco não viram linhas vazias; o título do PDF leva o nome do arquivo", async () => {
  const { bytes, trace } = await fileCertificatePdf(fonts, { ...cert, title: "", contact: "", note: "" });
  expect(trace).not.toContain("Obra");
  expect(trace).not.toContain("Contato");
  expect((await PDFDocument.load(bytes)).getTitle()).toBe("Certificado de integridade: gato-sentado.stl");
});
