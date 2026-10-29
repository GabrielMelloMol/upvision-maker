import { formatDocument, oneLineAddress, type Company } from "../domain/customers";
import { readableOnWhite } from "../domain/brandColor";
import { logError } from "../diagnostics/log";
import { A4, COLOR, hex, MARGIN, type Pdf } from "./doc";
import { rgb } from "pdf-lib";

const LOGO_W = 110;
const LOGO_H = 52;

/** Rodapé de todas as páginas: quem é e como chamar no WhatsApp/Instagram, mesmo com a folha solta (#296). */
export const companyFooter = (c: Company, doc = "") =>
  [c.tradeName || c.name, c.phone, c.instagram && `@${c.instagram.replace(/^@/, "")}`, doc].filter(Boolean).join(" · ");

/** Cabeçalho padrão: logo + dados da empresa à esquerda, título e números à direita. */
export async function companyHeader(pdf: Pdf, c: Company, title: string, right: string[]) {
  if (c.brandColor) pdf.accent = hex(readableOnWhite(c.brandColor));
  const top = pdf.y;
  let x = MARGIN;
  if (c.logo) {
    try {
      pdf.drawContain(await pdf.image(c.logo), MARGIN, top - LOGO_H, LOGO_W, LOGO_H);
      x = MARGIN + LOGO_W + 14;
    } catch (e) {
      logError("logo no PDF", e, "warn"); // logo ruim não impede o documento; a tela de Dados da empresa já recusa no envio (#295)
    }
  }
  const name = c.tradeName || c.name || "Sua empresa";
  pdf.at(name, x, top - 14, { size: 14, font: "bold" });
  const info = [c.document && (c.document.length === 14 ? `CNPJ ${formatDocument(c.document)}` : `CPF ${formatDocument(c.document)}`), [c.phone, c.email].filter(Boolean).join(" · "), c.instagram && `@${c.instagram.replace(/^@/, "")}`, oneLineAddress(c)].filter(Boolean) as string[];
  info.forEach((l, i) => pdf.at(l, x, top - 30 - i * 13, { size: 9.5, color: COLOR.muted })); // ≥ 9,5 pt: o cliente lê isso impresso (#296)
  pdf.at(title, A4.w - MARGIN, top - 16, { size: 18, font: "bold", color: pdf.accent, align: "right" });
  right.forEach((l, i) => pdf.at(l, A4.w - MARGIN, top - 32 - i * 12, { size: 9, color: COLOR.muted, align: "right" }));
  pdf.y = top - Math.max(LOGO_H, 30 + info.length * 13, 32 + right.length * 12) - 12;
  pdf.rule(pdf.accent);
  pdf.gap(14);
}

const BAND_H = 150;
const STRIPE_H = 5;
const BAND_LOGO_W = 200;
const BAND_LOGO_H = 72;
const LOGO_PAD = 8;
const SOFT_WHITE = rgb(0.82, 0.85, 0.92);

/**
 * Cabeçalho do orçamento e do pedido (#301, modelo da Bia): faixa na cor da marca de ponta a ponta, logo à esquerda,
 * título e número à direita, linha na cor de destaque embaixo. Logo sem versão para fundo escuro vai num quadro branco.
 */
export async function bandHeader(pdf: Pdf, c: Company, title: string, number: string, right: string[]) {
  pdf.accent = hex(readableOnWhite(c.brandColor)); // ≥ 4,5:1 com o branco: serve de fundo para o texto branco também
  const bottom = A4.h - BAND_H;
  pdf.page.drawRectangle({ x: 0, y: bottom, width: A4.w, height: BAND_H, color: pdf.accent });
  if (c.accentColor) pdf.page.drawRectangle({ x: 0, y: bottom - STRIPE_H, width: A4.w, height: STRIPE_H, color: hex(c.accentColor) });

  const top = A4.h - 30;
  let drawn = false;
  for (const [logo, boxed] of [[c.logoDark, false], [c.logo, true]] as const) {
    if (!logo || drawn) continue;
    try {
      const img = await pdf.image(logo);
      if (boxed) {
        // o quadro abraça o logo encaixado, sem sobra branca dos lados
        const s = Math.min((BAND_LOGO_W - 2 * LOGO_PAD) / img.width, (BAND_LOGO_H - 2 * LOGO_PAD) / img.height);
        const [w, h] = [img.width * s + 2 * LOGO_PAD, img.height * s + 2 * LOGO_PAD];
        pdf.roundRect(MARGIN, top, w, h, 6, COLOR.white);
        pdf.drawContain(img, MARGIN + LOGO_PAD, top - h + LOGO_PAD, w - 2 * LOGO_PAD, h - 2 * LOGO_PAD);
      } else pdf.drawContain(img, MARGIN, top - BAND_LOGO_H, BAND_LOGO_W, BAND_LOGO_H);
      drawn = true;
    } catch (e) {
      logError("logo no PDF", e, "warn");
    }
  }
  if (!drawn) pdf.at(c.tradeName || c.name || "Sua empresa", MARGIN, top - 26, { size: 20, font: "bold", color: COLOR.white });
  if (c.slogan) pdf.at(c.slogan.toUpperCase(), MARGIN, bottom + 26, { size: 9, font: "semibold", color: COLOR.white });

  pdf.at(title.toUpperCase(), A4.w - MARGIN, top - 26, { size: 21, font: "bold", color: COLOR.white, align: "right" });
  pdf.at(number, A4.w - MARGIN, top - 46, { size: 12, font: "bold", color: COLOR.white, align: "right" });
  right.forEach((l, i) => pdf.at(l, A4.w - MARGIN, bottom + 26 + (right.length - 1 - i) * 15, { size: 9.5, color: SOFT_WHITE, align: "right" }));
  pdf.y = bottom - STRIPE_H - 30;
}

/** Rótulo pequeno em maiúsculas (PREPARADO PARA, FORMA DE PAGAMENTO…). */
export const label = (pdf: Pdf, text: string, x = MARGIN, y = pdf.y - 8) => pdf.at(text.toUpperCase(), x, y, { size: 8, font: "semibold", color: COLOR.muted });

/** Título de seção na cor da marca (REFERÊNCIA DO PROJETO 3D, CONDIÇÕES…), a partir do cursor. */
export function heading(pdf: Pdf, text: string, x = MARGIN, width?: number) {
  pdf.ensure(40);
  pdf.text(text.toUpperCase(), { x, width, size: 9.5, font: "bold", color: pdf.accent });
  pdf.gap(4);
}

/** Rodapé do orçamento e do pedido (#301): nome em destaque e, embaixo, frase e contato. */
export const bandFooter = (c: Company) => ({
  name: c.tradeName || c.name,
  line: [c.slogan, c.phone, c.instagram && `@${c.instagram.replace(/^@/, "")}`, c.document && (c.document.length === 14 ? `CNPJ ${formatDocument(c.document)}` : "")].filter(Boolean).join(" · "),
});
