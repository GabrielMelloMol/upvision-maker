import { certificatePayload, bytesLabel, groupedHash, localStamp, proofCode, type Certificate } from "../domain/fileProof";
import { qrMatrix } from "../domain/qr";
import { A4, COLOR, MARGIN, Pdf, mm, type PdfFonts } from "./doc";

const QR_SIZE = mm(38);

/**
 * Certificado de integridade de arquivo (#228): hash SHA-256, data, autoria e um QR com o hash. É uma prova de que o arquivo
 * é exatamente este (qualquer mudança de um bit muda o hash); a data vem do relógio de quem emitiu, então o certificado
 * não é registro de autoria por si só. O texto diz isso com todas as letras.
 */
export async function fileCertificatePdf(fonts: PdfFonts, c: Certificate): Promise<{ bytes: Uint8Array; trace: string[] }> {
  const pdf = await Pdf.create(fonts, `Certificado de integridade: ${c.name}`);
  pdf.text("Certificado de integridade de arquivo", { size: 20, font: "bold" });
  pdf.text(`Código ${proofCode(c.sha256)}`, { size: 11, font: "semibold", color: COLOR.accent });
  pdf.gap(8);
  pdf.rule();
  pdf.gap(10);

  const top = pdf.y;
  const half = pdf.width - QR_SIZE - 16;
  const field = (label: string, value: string) => {
    if (!value.trim()) return;
    pdf.text(label, { size: 8.5, font: "semibold", color: COLOR.muted, width: half });
    pdf.text(value, { size: 11, width: half });
    pdf.gap(5);
  };
  field("Obra", c.title);
  field("Autor ou loja", c.author);
  field("Contato", c.contact);
  field("Arquivo", c.name);
  field("Tamanho", `${bytesLabel(c.size)} (${c.size.toLocaleString("pt-BR")} bytes)`);
  field("Emitido em", `${localStamp(c.at)} (horário do computador) · ${c.at.replace("T", " ").slice(0, 19)} UTC`);
  if (c.note.trim()) field("Observação", c.note);

  // QR à direita, no alto
  const qrX = A4.w - MARGIN - QR_SIZE;
  const qrY = top - QR_SIZE;
  pdf.qr(qrMatrix(certificatePayload(c), "M"), qrX, qrY, QR_SIZE, 2);
  pdf.at("QR com o hash", qrX + QR_SIZE / 2, qrY - 11, { size: 8, color: COLOR.muted, align: "center" });
  pdf.y = Math.min(pdf.y, qrY - 22);

  pdf.gap(4);
  pdf.text("Impressão digital do arquivo (SHA-256)", { size: 8.5, font: "semibold", color: COLOR.muted });
  const lines = groupedHash(c.sha256, 2);
  const boxH = 48;
  pdf.ensure(boxH);
  pdf.roundRect(MARGIN, pdf.y, pdf.width, boxH, 6, COLOR.soft);
  lines.forEach((l, i) => pdf.at(l, MARGIN + 12, pdf.y - 20 - i * 16, { size: 12, font: "bold" }));
  pdf.trace.push(c.sha256);
  pdf.y -= boxH + 14;

  pdf.text("O que este certificado mostra", { size: 12, font: "bold" });
  pdf.gap(2);
  pdf.text("Que o arquivo acima, com exatamente este conteúdo, existia no computador de quem emitiu na data indicada. Se um único byte do arquivo mudar, o hash muda e a conferência falha: assim dá para provar que a peça entregue é a mesma do certificado.", { size: 10 });
  pdf.gap(8);
  pdf.text("Como conferir", { size: 12, font: "bold" });
  pdf.gap(2);
  pdf.text("1. No UpVision Maker, abra Criar > Proteger arquivo > Conferir um arquivo.\n2. Escolha o arquivo e informe o hash deste certificado (digite, cole, escaneie o QR ou abra o arquivo .json salvo junto).\n3. O app diz se o arquivo confere. Funciona sem internet. Qualquer ferramenta de SHA-256 também serve: o hash tem que ser igual ao de cima.", { size: 10 });
  pdf.gap(8);
  pdf.text("O que ele não mostra", { size: 12, font: "bold" });
  pdf.gap(2);
  pdf.text("A data vem do relógio do computador de quem emitiu e não é um carimbo de tempo independente; o certificado também não prova quem criou o desenho. Para reforçar a prova de data e de autoria, guarde este PDF e o arquivo juntos e registre o envio por um meio com data confiável (e-mail para você mesmo, plataforma de venda, cartório digital ou registro de obra).", { size: 10 });
  const bytes = await pdf.save("UpVision Maker · Certificado de integridade de arquivo");
  return { bytes, trace: pdf.trace };
}
