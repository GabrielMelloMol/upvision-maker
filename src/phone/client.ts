import { parseFilamentQr } from "../domain/spoolQr";
import { decodeQr } from "../tools/qrDecode";
import type { PhoneSummary } from "./types";

/** Lado do celular (#16): conversa com o app do computador pela rede de casa. */
export class NotPaired extends Error {}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, body === undefined ? { credentials: "same-origin" } : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-UpVision": "1" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Sem conexão com o computador. Ele está ligado, com o app aberto e no mesmo Wi-Fi?");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && path !== "/api/pair") throw new NotPaired(data.error ?? "Conecte com o código.");
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}.`);
  return data;
}

export const pair = (code: string) => api<{ ok: true }>("/api/pair", { code: code.replace(/\D/g, "") });
export const loadSummary = () => api<PhoneSummary>("/api/summary");
export const finishOrder = (id: number) => api<{ ok: true }>(`/api/orders/${id}/done`, {});
export const consumeFilament = (id: number, grams: number) => api<{ stockG: number }>(`/api/filaments/${id}/consume`, { grams });

/** Código que veio no QR da tela do computador (`#codigo=123456`), tirado da barra de endereço depois de lido. */
export function codeFromHash(loc: Location = location): string | null {
  const m = /codigo=(\d{6})/.exec(loc.hash);
  if (m) history.replaceState(null, "", loc.pathname);
  return m?.[1] ?? null;
}

const MAX_SIDE = 1280;

/**
 * Foto da etiqueta do rolo → id do filamento. Usa a câmera pelo seletor de arquivo (capture), que funciona em http
 * na rede de casa; a câmera ao vivo do navegador exige https.
 */
export async function filamentFromPhoto(file: File): Promise<number> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const ctx = Object.assign(document.createElement("canvas"), { width: w, height: h }).getContext("2d");
  if (!ctx) throw new Error("Não consegui ler a foto.");
  ctx.drawImage(img, 0, 0, w, h);
  const text = decodeQr(ctx.getImageData(0, 0, w, h).data, w, h);
  if (!text) throw new Error("Não achei o QR na foto. Chegue mais perto da etiqueta e tente de novo.");
  const id = parseFilamentQr(text);
  if (id === null) throw new Error("Esse QR não é uma etiqueta de rolo do UpVision Maker.");
  return id;
}
