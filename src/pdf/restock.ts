import { restockTotal, type Consignment, type ConsignmentItem } from "../domain/consignments";
import { oneLineAddress, type Company, type Customer } from "../domain/customers";
import { COLOR, dateBr, moneyBr, Pdf, type PdfFonts } from "./doc";
import { companyHeader } from "./header";

/**
 * Termo de reposição de consignado (#184), para a loja assinar: o que está sendo reposto agora (com o repasse), colunas em
 * branco para anotar o acerto do ciclo (vendidas e devolvidas), total em repasse, próxima reposição e as assinaturas.
 */
export async function restockPdf(fonts: PdfFonts, company: Company, c: Consignment, customer: Customer | null | undefined, items: ConsignmentItem[], date: string, nextDate: string): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const pdf = await Pdf.create(fonts, `Termo de reposição - ${c.customerName}`);
  await companyHeader(pdf, company, "Reposição", [`Data ${dateBr(date)}`, `Contrato desde ${dateBr(c.startDate)}`]);
  pdf.text("TERMO DE REPOSIÇÃO DE PEÇAS EM CONSIGNAÇÃO", { size: 13, font: "bold", align: "center" });
  pdf.gap(6);
  const party = (name: string, address: string) => [name, address].filter(Boolean).join(", ");
  pdf.text(`CONSIGNANTE: ${party(company.name || company.tradeName, oneLineAddress(company))}.`, { size: 9.5 });
  pdf.text(`CONSIGNATÁRIO: ${party(c.customerName, customer ? oneLineAddress(customer) : "")}.`, { size: 9.5 });
  pdf.gap(6);
  pdf.text(`Em ${dateBr(date)}, o CONSIGNANTE repõe ao CONSIGNATÁRIO as peças abaixo, nas mesmas condições do contrato de consignação firmado em ${dateBr(c.startDate)}. As peças continuam sendo do CONSIGNANTE até o acerto.`, { size: 9.5 });
  pdf.gap(6);
  const w = pdf.width;
  pdf.table(
    [
      { title: "Peça", width: w - 320 },
      { title: "Repasse un.", width: 80, align: "right" },
      { title: "Repostas", width: 60, align: "right" },
      { title: "Vendidas", width: 90, align: "right" },
      { title: "Devolvidas", width: 90, align: "right" },
    ],
    items.map((i) => [i.name, moneyBr(i.transferPrice), i.qty.toLocaleString("pt-BR"), "________", "________"]),
  );
  pdf.gap(4);
  pdf.text(`Total em repasse desta reposição, se todas forem vendidas: ${moneyBr(restockTotal(items))}`, { size: 9.5, font: "semibold", align: "right" });
  pdf.gap(8);
  pdf.text("As colunas Vendidas e Devolvidas registram o acerto do ciclo anterior e são preenchidas por quem confere as peças.", { size: 8.5, color: COLOR.muted });
  pdf.text(`Próxima reposição prevista: ${dateBr(nextDate)} (a cada ${c.periodDays} dias).`, { size: 9.5 });
  pdf.gap(40);
  pdf.ensure(60);
  const y = pdf.y;
  const half = w / 2 - 20;
  for (const [i, label] of [`CONSIGNANTE: ${company.name || company.tradeName}`, `CONSIGNATÁRIO: ${c.customerName}`].entries()) {
    const x = 42 + i * (half + 40);
    pdf.page.drawLine({ start: { x, y }, end: { x: x + half, y }, thickness: 0.8, color: COLOR.text });
    pdf.at(label, x, y - 12, { size: 8.5, color: COLOR.muted });
  }
  pdf.y = y - 40;
  pdf.text("Modelo simples gerado pelo UpVision Maker. Não substitui orientação jurídica: revise para o seu caso.", { size: 7.5, color: COLOR.muted });
  return { bytes: await pdf.save(`${company.tradeName || company.name} · reposição`), trace: pdf.trace };
}
