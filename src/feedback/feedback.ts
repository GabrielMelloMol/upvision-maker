/**
 * Sugestões e diagnóstico chegando ao Gabriel sem GitHub e sem cliente de e-mail (#83):
 * 1) pelo app, para o endpoint do Worker (services/feedback-worker), se o build tiver VITE_FEEDBACK_URL;
 * 2) pelo WhatsApp com o texto pronto, se o build tiver VITE_FEEDBACK_WHATSAPP;
 * 3) "Copiar texto", sempre.
 */
export type FeedbackImage = { name: string; type: string; base64: string };
export type Feedback = {
  kind: "Sugestão" | "Diagnóstico";
  title: string;
  description: string;
  appVersion: string;
  platform: string;
  /** Últimos registros (só no diagnóstico), já sem dados pessoais. */
  diagnostics?: string;
  image?: FeedbackImage;
};

export const MAX_TITLE = 80;
export const MAX_DESCRIPTION = 1500;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const WHATSAPP_TEXT = 3000; // o wa.me corta textos longos
const HISTORY_MAX = 20;
const INSTALL_KEY = "upvision:instalacao";
const HISTORY_KEY = "upvision:sugestoes-enviadas";

export type Channels = { endpoint: string | null; whatsapp: string | null };

/** Canais que este build oferece (variáveis de build, nunca no código). */
export function feedbackChannels(env: { VITE_FEEDBACK_URL?: string; VITE_FEEDBACK_WHATSAPP?: string }): Channels {
  const url = env.VITE_FEEDBACK_URL?.trim() ?? "";
  const digits = (env.VITE_FEEDBACK_WHATSAPP ?? "").replace(/\D/g, "");
  return { endpoint: /^https:\/\/\S+$/.test(url) ? url : null, whatsapp: digits.length >= 12 && digits.length <= 13 ? digits : null };
}

/** Texto único para copiar ou mandar pelo WhatsApp. */
export function feedbackText(f: Feedback): string {
  const lines = [`[UpVision Maker] ${f.kind}: ${f.title.trim().slice(0, MAX_TITLE)}`];
  const d = f.description.trim().slice(0, MAX_DESCRIPTION);
  if (d) lines.push("", d);
  if (f.diagnostics?.trim()) lines.push("", f.diagnostics.trim());
  lines.push("", `Versão ${f.appVersion} · ${f.platform}`);
  return lines.join("\n");
}

export function whatsappUrl(f: Feedback, number: string): string {
  let text = feedbackText(f);
  if (f.image) text += `\n\n(Em seguida mande a imagem ${f.image.name} nesta conversa.)`;
  const u = new URL(`https://wa.me/${number}`);
  u.searchParams.set("text", text.length > WHATSAPP_TEXT ? `${text.slice(0, WHATSAPP_TEXT)}…` : text);
  return u.toString();
}

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Id aleatório desta instalação (limite de envios por instalação no Worker). Não identifica a pessoa. */
export function installationId(): string {
  const s = store();
  const saved = s?.getItem(INSTALL_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  s?.setItem(INSTALL_KEY, id);
  return id;
}

/** Envia pelo app. Devolve o recibo; erros vêm com mensagem para a usuária. */
export async function sendFeedback(f: Feedback, target: { endpoint: string; token: string }, fetchFn: typeof fetch = fetch): Promise<{ id: string }> {
  let res: Response;
  try {
    res = await fetchFn(target.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": target.token },
      body: JSON.stringify({ ...f, title: f.title.trim().slice(0, MAX_TITLE), description: f.description.trim().slice(0, MAX_DESCRIPTION), installId: installationId() }),
    });
  } catch {
    throw new Error("Não consegui enviar: confira a internet e tente de novo, ou use o WhatsApp ou Copiar texto.");
  }
  if (res.status === 429) throw new Error("Você mandou muitas mensagens seguidas. Espere um pouco e tente de novo.");
  if (!res.ok) throw new Error(`O servidor não recebeu (erro ${res.status}). Use o WhatsApp ou Copiar texto.`);
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: body.id ?? "" };
}

export type SentEntry = { title: string; kind: Feedback["kind"]; via: "app" | "whatsapp" | "copia"; at: string };

/** Sugestões enviadas, guardadas só neste computador (mais recente primeiro). */
export function sentHistory(): SentEntry[] {
  try {
    const v = JSON.parse(store()?.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? (v as SentEntry[]) : [];
  } catch {
    return [];
  }
}

export function rememberSent(e: SentEntry): void {
  try {
    store()?.setItem(HISTORY_KEY, JSON.stringify([e, ...sentHistory()].slice(0, HISTORY_MAX)));
  } catch {
    // sem armazenamento: só não guarda o histórico
  }
}

/** Imagem escolhida → base64 para o envio (até 2 MB). */
export async function readImage(file: File): Promise<FeedbackImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("A imagem passa de 2 MB. Escolha uma menor ou tire um print só da parte que importa.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type || "application/octet-stream", base64: btoa(bin) };
}
