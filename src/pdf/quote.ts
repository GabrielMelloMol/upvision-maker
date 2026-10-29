import type { Company, Customer } from "../domain/customers";
import { quoteNumber, type Quote } from "../domain/quotes";
import { A4, COLOR, dateBr, MARGIN, Pdf, type PdfFonts } from "./doc";
import { bandFooter, bandHeader, heading, label } from "./header";
import { factsRow, itemsTable, pixBox, totalsBlock } from "./orderParts";

/** Orçamento em A4: itens, descontos, frete, total, validade, condições e QR Pix com o valor exato. */
/** `photos`: capa de cada produto (id → data URL, #162); os itens com produto e foto aparecem em "Fotos das peças". */
export async function quotePdf(fonts: PdfFonts, company: Company, q: Quote, customer?: Customer | null, photos: Record<number, string> = {}): Promise<{ bytes: Uint8Array; trace: string[]; pixError: string | null }> {
  const num = quoteNumber(q, company.quotePrefix);
  const pdf = await Pdf.create(fonts, `Orçamento ${num} - ${q.customerName}`);
  await bandHeader(pdf, company, "Orçamento", num, [`Emissão: ${dateBr(q.createdAt)}`, `Validade: ${dateBr(q.validUntil)}`]);
  customerBlock(pdf, "Preparado para", q.customerName, customer);

  itemsTable(pdf, q.items);
  await photoStrip(pdf, q, photos);
  const t = totalsBlock(pdf, q.items, q.freight, q.paymentMethod && ["Forma de pagamento", q.paymentMethod]);
  factsRow(pdf, [q.dueDate && ["Prazo de entrega", dateBr(q.dueDate)]]);
  await reference(pdf, q);

  const pixError = pixBox(pdf, company, t.total, `ORC${q.id}`);
  const footer = bandFooter(company);
  return { bytes: await pdf.save(footer.line, { name: footer.name, ref: num }), trace: pdf.trace, pixError };
}

/** "PREPARADO PARA" / "CLIENTE" + nome grande + contato, abaixo da faixa (#301). */
export function customerBlock(pdf: Pdf, title: string, name: string, customer?: Customer | null) {
  label(pdf, title);
  pdf.gap(14);
  pdf.text(name.toUpperCase(), { size: 19, font: "bold" });
  const contact = customer ? [customer.phone, customer.email].filter(Boolean).join(" · ") : "";
  if (contact) pdf.text(contact, { size: 9.5, color: COLOR.muted });
  pdf.gap(12);
}

const REF_IMG = 230;
const REF_GAP = 26;

/**
 * "Referência do projeto 3D" (#301): imagem à esquerda; à direita cor e tamanho num quadro, observações e condições.
 * Sem imagem, tudo em largura cheia. Sem imagem, cor nem tamanho, só observações e condições.
 */
async function reference(pdf: Pdf, q: Quote) {
  const facts = ([["Cor", q.refColor], ["Tamanho considerado", q.refSize]] as const).filter(([, v]) => v);
  const texts = ([["Observações", q.notes], ["Condições", q.terms]] as const).filter(([, v]) => v);
  if (!q.refImage && !facts.length && !texts.length) return;
  pdf.gap(4);
  pdf.ensure(q.refImage ? REF_IMG + 60 : 60);
  pdf.rule();
  pdf.gap(18);
  let x = MARGIN;
  let bottom = pdf.y;
  if (q.refImage || facts.length) heading(pdf, "Referência do projeto 3D");
  const top = pdf.y;
  if (q.refImage) {
    let h = REF_IMG;
    try {
      const img = await pdf.image(q.refImage);
      h = img.height * Math.min(REF_IMG / img.width, REF_IMG / img.height); // foto deitada: legenda logo embaixo, sem vão
      pdf.drawContain(img, MARGIN, top - h, REF_IMG, h);
    } catch {
      pdf.page.drawRectangle({ x: MARGIN, y: top - h, width: REF_IMG, height: h, color: COLOR.soft }); // imagem que o PDF não lê
    }
    pdf.at("Imagem de referência.", MARGIN, top - h - 13, { size: 8.5, color: COLOR.muted });
    bottom = top - h - 22;
    x = MARGIN + REF_IMG + REF_GAP;
  }
  const width = A4.w - MARGIN - x;
  if (facts.length) {
    const h = 14 + facts.length * 38;
    pdf.page.drawRectangle({ x, y: top - h, width, height: h, color: COLOR.soft });
    facts.forEach(([l, v], i) => {
      label(pdf, l, x + 16, top - 22 - i * 38);
      pdf.at(v, x + 16, top - 39 - i * 38, { size: 12, font: "bold" });
    });
    pdf.y = top - h - 18;
  }
  for (const [l, v] of texts) {
    heading(pdf, l, x, width);
    pdf.text(v, { x, width, size: 10 });
    pdf.gap(12);
  }
  pdf.y = Math.min(pdf.y, bottom);
}

const THUMB = 92;

/** Primeira linha do texto que cabe na largura, com "…" se cortou. */
function oneLine(pdf: Pdf, text: string, size: number, width: number) {
  const lines = pdf.wrap(text, size, pdf.fonts.regular, width);
  if (lines.length < 2) return lines[0] ?? "";
  let l = lines[0];
  while (l && pdf.fonts.regular.widthOfTextAtSize(`${l}…`, size) > width) l = l.slice(0, -1);
  return `${l.trimEnd()}…`;
}
const THUMB_GAP = 10;

/** Fotos reais das peças do orçamento (#162): uma por produto com capa, numa faixa com o nome embaixo. */
async function photoStrip(pdf: Pdf, q: Quote, photos: Record<number, string>) {
  const seen = new Set<number>();
  const items = q.items.filter((i) => i.productId && photos[i.productId] && !seen.has(i.productId) && seen.add(i.productId));
  if (!items.length) return;
  const perRow = Math.max(1, Math.floor((pdf.width + THUMB_GAP) / (THUMB + THUMB_GAP)));
  pdf.gap(10);
  pdf.ensure(20);
  heading(pdf, "Fotos das peças");
  for (let i = 0; i < items.length; i += perRow) {
    pdf.ensure(THUMB + 26);
    const top = pdf.y;
    for (const [k, it] of items.slice(i, i + perRow).entries()) {
      const x = MARGIN + k * (THUMB + THUMB_GAP);
      try {
        pdf.drawContain(await pdf.image(photos[it.productId!]), x, top - THUMB, THUMB, THUMB);
      } catch {
        pdf.page.drawRectangle({ x, y: top - THUMB, width: THUMB, height: THUMB, color: COLOR.soft }); // foto que o PDF não lê
      }
      const name = oneLine(pdf, it.description, 8, THUMB);
      pdf.at(name, x, top - THUMB - 11, { size: 8, color: COLOR.muted });
    }
    pdf.gap(THUMB + 18);
  }
}
