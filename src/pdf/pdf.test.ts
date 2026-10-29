import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { DEFAULT_COMPANY, EMPTY_CUSTOMER, type Company } from "../domain/customers";
import type { Order } from "../domain/orders";
import type { Quote } from "../domain/quotes";
import { catalogPdf, PER_PAGE } from "./catalog";
import { contractPdf, DEFAULT_TERMS } from "./contract";
import type { PdfFonts } from "./doc";
import type { Consignment } from "../domain/consignments";
import { orderConfirmationPdf } from "./orderConfirmation";
import { restockPdf } from "./restock";
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
  refImage: "",
  refColor: "",
  refSize: "",
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
  expect(txt((await quotePdf(fonts, company, withProduct, undefined, { 1: PNG })).trace)).toContain("FOTOS DAS PEÇAS");
  expect(txt((await quotePdf(fonts, company, withProduct)).trace)).not.toContain("FOTOS DAS PEÇAS");
});

test("orçamento longo quebra página e repete o cabeçalho da tabela", async () => {
  const r = await quotePdf(fonts, company, quote(60));
  const n = (await pages(r.bytes)).length;
  expect(n).toBeGreaterThanOrEqual(3);
  expect(r.trace.filter((t) => t === "UNITÁRIO").length).toBeGreaterThanOrEqual(n - 1); // cabeçalho repetido nas páginas da tabela
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

const order = (paidAmount: number, extra: Partial<Order> = {}): Order => ({
  id: 12,
  customerId: null,
  customerName: "Ana Souza",
  channel: "Consumidor final",
  dueDate: "2026-10-20",
  paymentMethod: "Pix",
  notes: "Letras em branco",
  freight: 12,
  status: "pending",
  stockApplied: false,
  appliedPlan: null,
  createdAt: "2026-09-28 10:00:00",
  deliveredAt: null,
  quoteId: 7,
  paidAmount,
  items: [{ id: 1, productId: null, description: "Chaveiro personalizado", qty: 2, unitPrice: 15, discountPct: 10, unitCost: 2, printMinutes: 20, custom: "Ana\nBia;Mãe" }],
  ...extra,
});

test("confirmação do pedido: itens com personalização, total, pagamento, prazo e Pix só do que falta (#185)", async () => {
  const r = await orderConfirmationPdf(fonts, company, order(20)); // total 2 × 15 − 10% + 12 = 39
  const t = txt(r.trace);
  expect(t).toContain("CONFIRMAÇÃO DE PEDIDO");
  expect(t).toContain("Pedido nº 12");
  expect(t).toContain("Chaveiro personalizado");
  expect(t).toContain("Personalização: Ana, Bia · Mãe"); // embaixo do nome, em cinza (#301)
  expect(t).toContain("R$ 39,00");
  expect(t).toContain("FORMA DE PAGAMENTO");
  expect(t).toContain("Sinal recebido");
  expect(t).toContain("Falta pagar: R$ 19,00");
  expect(t).toContain("Pague com Pix: R$ 19,00");
  expect(t.some((l) => l.includes("540519.00"))).toBe(true); // BR Code com o saldo (campo 54), não o total
  expect(r.pixError).toBeNull();
  expect(await pages(r.bytes)).toHaveLength(1);
});

test("confirmação de pedido já pago não leva QR Pix e agradece; sem chave Pix também não", async () => {
  const paid = await orderConfirmationPdf(fonts, company, order(39));
  expect(txt(paid.trace)).toContain("Pagamento em dia. Obrigado!");
  expect(paid.trace.some((l) => l.startsWith("Pague com Pix"))).toBe(false);
  const noKey = await orderConfirmationPdf(fonts, { ...company, pixKey: "" }, order(0));
  expect(txt(noKey.trace)).toContain("Falta pagar: R$ 39,00");
  expect(noKey.trace.some((l) => l.startsWith("Pague com Pix"))).toBe(false);
});

test("termo de reposição: partes, peças repostas com repasse, colunas do acerto, próxima data e assinaturas (#184)", async () => {
  const c: Consignment = { id: 1, customerId: 3, customerName: "Loja da Bia", startDate: "2026-09-01", periodDays: 30, notes: "", active: true, lastRestockAt: null, createdAt: "2026-09-01", items: [] };
  const items = [{ productId: 1, name: "Chaveiro", qty: 20, transferPrice: 8, salePrice: 15 }];
  const r = await restockPdf(fonts, company, c, { ...EMPTY_CUSTOMER, id: 3, name: "Loja da Bia" }, items, "2026-10-02", "2026-11-01");
  const t = r.trace.join("\n");
  expect(t).toContain("CONSIGNATÁRIO: Loja da Bia");
  expect(t).toContain("Chaveiro");
  expect(t).toContain("Vendidas");
  expect(t).toContain("Devolvidas");
  expect(txt(r.trace)).toContain("Total em repasse desta reposição, se todas forem vendidas: R$ 160,00");
  expect(t).toContain("Próxima reposição prevista: 01/11/2026 (a cada 30 dias).");
  expect(t).toMatch(/Não substitui orientação jurídica/);
  expect(await pages(r.bytes)).toHaveLength(1);
});

test("imagem que o PDF não aceita dá erro claro em vez de sumir (#295)", async () => {
  const { checkPdfImage } = await import("./doc");
  await expect(checkPdfImage(PNG)).resolves.toBeUndefined();
  await expect(checkPdfImage("data:image/webp;base64,UklGRg==")).rejects.toThrow("formato que o PDF não aceita");
  await expect(checkPdfImage("data:image/png;base64,TE9HTw==")).rejects.toThrow();
});

test("marca no PDF (#296): cor da marca legível, rodapé com contato e legenda cortada com reticências", async () => {
  const { companyHeader, companyFooter } = await import("./header");
  const { Pdf } = await import("./doc");
  const { readableOnWhite } = await import("../domain/brandColor");
  const pdf = await Pdf.create(fonts, "t");
  await companyHeader(pdf, { ...company, brandColor: "#FFD400" }, "Orçamento", []);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(readableOnWhite("#FFD400").slice(i, i + 2), 16) / 255);
  expect(pdf.accent).toMatchObject({ red: r, green: g, blue: b });

  expect(companyFooter({ ...company, instagram: "@lua3d" }, "orçamento ORC-1")).toBe("UpVision 3D · 21 99999-0000 · @lua3d · orçamento ORC-1");
  expect(companyFooter(DEFAULT_COMPANY, "pedido 3")).toBe("pedido 3"); // sem nome: sem " · " solto no começo

  const q = quote(1);
  const long = { ...q, items: [{ ...q.items[0], productId: 1, description: "Medalha de corrida 7 cm com fita azul" }] };
  const t = (await quotePdf(fonts, company, long, null, { 1: PNG })).trace;
  expect(t.some((l) => /^Medalha.*…$/.test(l))).toBe(true);
  expect(t).toContain("21 99999-0000"); // rodapé (#301): nome em destaque e, embaixo, frase e contato
  expect(t).toContain("UpVision 3D");
});

test("referência do projeto (#301): imagem, cor e tamanho só quando preenchidos; imagem ruim não quebra o PDF", async () => {
  const q = quote(1);
  const ref = (await quotePdf(fonts, { ...company, logoDark: PNG, slogan: "Impressão 3D" }, { ...q, refImage: PNG, refColor: "Dourado", refSize: "25 cm" })).trace;
  expect(ref).toEqual(expect.arrayContaining(["REFERÊNCIA DO PROJETO 3D", "Imagem de referência.", "Dourado", "25 cm", "IMPRESSÃO 3D", "PREPARADO PARA", "ANA SOUZA"]));
  const none = (await quotePdf(fonts, company, q)).trace;
  expect(none).not.toContain("REFERÊNCIA DO PROJETO 3D");
  expect(none).toContain("CONDIÇÕES"); // condições e observações continuam saindo sem a referência
  const bad = await quotePdf(fonts, { ...company, logo: "data:image/png;base64,TE9HTw==" }, { ...q, refImage: "data:image/png;base64,TE9HTw==" });
  expect(bad.trace.filter((t) => t === "UpVision 3D")).toHaveLength(2); // logo ilegível: o nome vai na faixa (e no rodapé)
  expect(bad.trace).toContain("Imagem de referência.");
});
