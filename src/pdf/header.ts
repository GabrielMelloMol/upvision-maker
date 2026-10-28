import { formatDocument, oneLineAddress, type Company } from "../domain/customers";
import { readableOnWhite } from "../domain/brandColor";
import { logError } from "../diagnostics/log";
import { A4, COLOR, hex, MARGIN, type Pdf } from "./doc";

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
