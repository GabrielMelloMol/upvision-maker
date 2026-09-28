/** Conteúdo do QR da etiqueta do rolo (#12): curto, para o QR sair pequeno e ler bem impresso. */
const PREFIX = "upvision:filamento/";

export const filamentQr = (id: number) => `${PREFIX}${id}`;

/** Id do filamento lido no QR; null se o texto não for uma etiqueta nossa. */
export function parseFilamentQr(text: string): number | null {
  const m = /^upvision:filamento\/([1-9]\d*)$/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}
