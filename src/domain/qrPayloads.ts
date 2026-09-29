import { linkPayload } from "./qr";

/** WhatsApp: número com DDD (o 55 do Brasil entra sozinho) → link wa.me que abre a conversa. */
export function whatsappPayload(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) throw new Error("Telefone do WhatsApp com DDD. Ex.: (21) 99999-0000");
  return `https://wa.me/${d}`;
}

/** Instagram: @perfil ou link do perfil. */
export function instagramPayload(handle: string): string {
  const h = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) throw new Error("Digite o @ do Instagram. Ex.: @minhaloja");
  return `https://instagram.com/${h}`;
}

/** Link da avaliação no Google (o do painel "Pedir avaliações" do Perfil da Empresa). */
export const reviewPayload = (link: string) => linkPayload(link);
