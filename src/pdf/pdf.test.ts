import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { DEFAULT_COMPANY, EMPTY_CUSTOMER, type Company } from "../domain/customers";
import type { Quote } from "../domain/quotes";
import { catalogPdf, PER_PAGE } from "./catalog";
import { contractPdf, DEFAULT_TERMS } from "./contract";
import type { PdfFonts } from "./doc";
import { quotePdf } from "./quote";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
const fonts: PdfFonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const company: Company = { ...DEFAULT_COMPANY, name: "UpVision 3D LTDA", tradeName: "UpVision 3D", city: "Rio de Janeiro", pixKey: "52998224725", phone: "21 99999-0000", logo: PNG };
const quote = (items: number): Quote => ({
  id: 7,
  year: 2026,
  seq: 7,
  createdAt: "2026-09-28 10:00:00",
  convertedOrderId: null,
  customerId: null,
  customerName: "Ana Souza",
  channel: "Consumidor final",
  dueDate: "2026-10-20",
  paymentMethod: "Pix",
  notes: "Letras em branco",
  freight: 12,
  validUntil: "2026-10-05",
  terms: "50% na aprovação.",
  items: Array.from({ length: items }, (_, i) => ({ productId: null, description: `Chaveiro personalizado ${i + 1}`, qty: 2, unitPrice: 15, discountPct: 10, unitCost: 2, printMinutes: 20, custom: "" })),
});
/** Texto desenhado, com espaço normal no lugar do não separável do R$. */
const txt = (trace: string[]) => trace.map((t) => t.replace(/\u00a0/g, " "));
const pages = async (bytes: Uint8Array) => {
  const d = await PDFDocument.load(bytes);
  return d.getPages().map((p) => p.getSize());
};

test("orçamento: A4, itens, total com desconto e frete, Pix com o valor", async () => {
  const r = await quotePdf(fonts, company, quote(2));
  const sizes = await pages(r.bytes);
  expect(sizes).toHaveLength(1);
  expect(sizes[0].width).toBeCloseTo(595.28, 1);
  expect(sizes[0].height).toBeCloseTo(841.89, 1);
  const t = txt(r.trace);
  expect(t).toContain("Chaveiro personalizado 2");
  expect(t).toContain("R$ 66,00"); // 2 × (2 × 15 − 10%) + 12
  expect(t).toContain("Pague com Pix: R$ 66,00");
  expect(t.some((l) => l.includes("540566.00"))).toBe(true); // BR Code com o valor (campo 54)
  expect(r.pixError).toBeNull();
});

test("orçamento com foto do produto mostra as fotos das peças (#162)", async () => {
  const q = quote(2);
  const withProduct = { ...q, items: q.items.map((it, i) => (i === 0 ? { ...it, productId: 1 } : it)) };
  expect(txt((await quotePdf(fonts, company, withProduct, undefined, { 1: PNG })).trace)).toContain("Fotos das peças");
  expect(txt((await quotePdf(fonts, company, withProduct)).trace)).not.toContain("Fotos das peças");
});

test("orçamento longo quebra página e repete o cabeçalho da tabela", async () => {
  const r = await quotePdf(fonts, company, quote(60));
  const n = (await pages(r.bytes)).length;
  expect(n).toBeGreaterThanOrEqual(3);
  expect(r.trace.filter((t) => t === "Unitário").length).toBeGreaterThanOrEqual(n - 1); // cabeçalho repetido nas páginas da tabela
  expect(r.trace).toContain("Chaveiro personalizado 60");
});

test("sem chave Pix, o orçamento sai sem QR (sem erro)", async () => {
  const r = await quotePdf(fonts, { ...company, pixKey: "" }, quote(1));
  expect(r.trace.some((t) => t.startsWith("Pague com Pix"))).toBe(false);
});

test("contrato de consignação: partes, itens com repasse e total, aviso jurídico", async () => {
  const r = await contractPdf(fonts, company, { ...EMPTY_CUSTOMER, id: 1, name: "Loja da Bia", document: "11222333000181" }, [{ name: "Chaveiro", qty: 20, transferPrice: 8, salePrice: 15 }], DEFAULT_TERMS("2026-09-28"));
  expect(r.trace.join("\n")).toContain("CONSIGNATÁRIO: Loja da Bia, CNPJ 11.222.333/0001-81");
  expect(r.trace.join("\n")).toContain("Total em repasse, se todas forem vendidas: R$ 160,00");
  expect(r.trace.join("\n")).toMatch(/Não substitui orientação jurídica/);
});

test("catálogo: 12 produtos por página", async () => {
  const items = Array.from({ length: PER_PAGE + 1 }, (_, i) => ({ name: `Produto ${i + 1}`, price: 10 + i, photo: i % 2 ? PNG : undefined }));
  const r = await catalogPdf(fonts, company, items);
  expect(await pages(r.bytes)).toHaveLength(2);
  expect(r.trace).toContain("Produto 13");
  expect(txt(r.trace)).toContain("R$ 22,00");
});
