import { formatDocument, oneLineAddress, type Company, type Customer } from "../domain/customers";
import { COLOR, dateBr, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";

export type ContractItem = { name: string; qty: number; transferPrice: number; salePrice: number };
export type ContractTerms = { date: string; periodDays: number; settlement: string; losses: string; returns: string; commissionNote: string };

export const DEFAULT_TERMS = (date: string): ContractTerms => ({
  date,
  periodDays: 30,
  settlement: "O acerto das peças vendidas será feito ao fim do período, pelo valor de repasse de cada item, por Pix ou dinheiro.",
  losses: "Peças perdidas, quebradas ou danificadas enquanto estiverem com o CONSIGNATÁRIO serão pagas pelo valor de repasse.",
  returns: "As peças não vendidas serão devolvidas ao fim do período, em bom estado, ou o prazo poderá ser renovado por acordo.",
  commissionNote: "O CONSIGNATÁRIO pode vender pelo preço sugerido; a diferença entre o preço de venda e o repasse é a sua margem.",
});

const person = (name: string, doc: string, address: string) => [name, doc && (doc.length === 14 ? `CNPJ ${formatDocument(doc)}` : `CPF ${formatDocument(doc)}`), address].filter(Boolean).join(", ");

/** Contrato de consignação: partes, itens com repasse e preço sugerido, cláusulas e assinaturas. */
export async function contractPdf(fonts: PdfFonts, company: Company, customer: Customer, items: ContractItem[], t: ContractTerms): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const pdf = await Pdf.create(fonts, `Contrato de consignação - ${customer.name}`);
  await companyHeader(pdf, company, "Consignação", [`Data ${dateBr(t.date)}`, `Prazo ${t.periodDays} dias`]);
  pdf.text("CONTRATO DE VENDA EM CONSIGNAÇÃO", { size: 13, font: "bold", align: "center" });
  pdf.gap(6);
  pdf.text(`CONSIGNANTE: ${person(company.name || company.tradeName, company.document, oneLineAddress(company))}.`, { size: 9.5 });
  pdf.text(`CONSIGNATÁRIO: ${person(customer.name, customer.document, oneLineAddress(customer))}.`, { size: 9.5 });
  pdf.gap(6);
  pdf.text("1. Objeto. O CONSIGNANTE entrega ao CONSIGNATÁRIO, para venda, as peças abaixo, que continuam sendo de propriedade do CONSIGNANTE até o acerto.", { size: 9.5 });
  pdf.gap(6);
  const w = pdf.width;
  pdf.table(
    [
      { title: "Peça", width: w - 250 },
      { title: "Qtd", width: 50, align: "right" },
      { title: "Repasse un.", width: 100, align: "right" },
      { title: "Preço sugerido", width: 100, align: "right" },
    ],
    items.map((i) => [i.name, i.qty.toLocaleString("pt-BR"), moneyBr(i.transferPrice), moneyBr(i.salePrice)]),
  );
  const total = items.reduce((s, i) => s + i.qty * i.transferPrice, 0);
  pdf.gap(4);
  pdf.text(`Total em repasse, se todas forem vendidas: ${moneyBr(total)}`, { size: 9.5, font: "semibold", align: "right" });
  pdf.gap(8);
  const clauses = [
    `2. Prazo. ${t.periodDays} dias a partir de ${dateBr(t.date)}.`,
    `3. Acerto. ${t.settlement}`,
    `4. Preço. ${t.commissionNote}`,
    `5. Perdas e danos. ${t.losses}`,
    `6. Devolução. ${t.returns}`,
  ];
  for (const c of clauses) {
    pdf.text(c, { size: 9.5 });
    pdf.gap(4);
  }
  pdf.gap(40);
  pdf.ensure(60);
  const y = pdf.y;
  const half = w / 2 - 20;
  for (const [i, label] of [`CONSIGNANTE: ${company.name || company.tradeName}`, `CONSIGNATÁRIO: ${customer.name}`].entries()) {
    const x = 42 + i * (half + 40);
    pdf.page.drawLine({ start: { x, y }, end: { x: x + half, y }, thickness: 0.8, color: COLOR.text });
    pdf.at(label, x, y - 12, { size: 8.5, color: COLOR.muted });
  }
  pdf.y = y - 40;
  pdf.text("Modelo simples gerado pelo UpVision Maker. Não substitui orientação jurídica: revise as cláusulas para o seu caso.", { size: 7.5, color: COLOR.muted });
  return { bytes: await pdf.save(`${company.tradeName || company.name} · consignação`), trace: pdf.trace };
}
