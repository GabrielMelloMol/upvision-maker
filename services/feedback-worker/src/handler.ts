/**
 * Worker de sugestões do UpVision Maker (#83). Recebe a mensagem do app e repassa ao Gabriel por e-mail (Resend)
 * e/ou como issue num repositório PRIVADO do GitHub. Nada fica guardado aqui além dos contadores do limite de envio.
 * Sem dependências: roda no Cloudflare Workers (plano gratuito) e nos testes do app (Node).
 */

/** O pedaço do Cloudflare KV que usamos. */
export type Kv = { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> };

export type Env = {
  /** Token que o app manda em X-App-Token (freio contra spam). */
  APP_TOKEN: string;
  /** KV dos contadores de envio. */
  RATE: Kv;
  /** E-mail pelo Resend (opcional se houver o GitHub). */
  RESEND_API_KEY?: string;
  FEEDBACK_TO?: string;
  FEEDBACK_FROM?: string;
  /** Issue privada (opcional se houver o e-mail): token com permissão de issues só nesse repo. */
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
};

type Payload = {
  kind: "Sugestão" | "Diagnóstico";
  title: string;
  description: string;
  appVersion: string;
  platform: string;
  installId: string;
  diagnostics?: string;
  image?: { name: string; type: string; base64: string };
};

const MAX_BODY = 3_500_000; // ~2 MB de imagem em base64 + o texto
const MAX_IMAGE_B64 = 2_800_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const PER_INSTALL_HOUR = 5;
const PER_IP_DAY = 30;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const CORS = {
  "Access-Control-Allow-Origin": "*", // o app chama de tauri://localhost / http://tauri.localhost; o token é a barreira
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

/** Comparação em tempo constante (não dá pista do token pelo tempo de resposta). */
function sameToken(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const str = (v: unknown, max: number, min = 0) => (typeof v === "string" && v.trim().length >= min && v.length <= max ? v : null);

function validate(raw: unknown): Payload | string {
  if (!raw || typeof raw !== "object") return "Mensagem vazia.";
  const b = raw as Record<string, unknown>;
  if (b.kind !== "Sugestão" && b.kind !== "Diagnóstico") return "Tipo inválido.";
  const title = str(b.title, 80, 1);
  const description = str(b.description ?? "", 1500);
  const appVersion = str(b.appVersion, 30, 1);
  const platform = str(b.platform, 30, 1);
  const installId = str(b.installId, 64, 8);
  const diagnostics = b.diagnostics === undefined ? undefined : str(b.diagnostics, 6000);
  if (title === null || description === null || appVersion === null || platform === null || installId === null || diagnostics === null) return "Campos inválidos.";
  let image: Payload["image"];
  if (b.image !== undefined) {
    const i = b.image as Record<string, unknown>;
    const name = str(i?.name, 100, 1);
    const b64 = str(i?.base64, MAX_IMAGE_B64, 4);
    if (!name || !b64 || !IMAGE_TYPES.includes(String(i.type)) || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return "Imagem inválida (PNG, JPG, WEBP ou GIF até 2 MB).";
    image = { name, type: String(i.type), base64: b64 };
  }
  return { kind: b.kind, title: title.trim(), description, appVersion, platform, installId, diagnostics, image };
}

/** Conta um envio na janela; devolve false se passou do limite. */
async function allow(kv: Kv, key: string, max: number, ttlSeconds: number): Promise<boolean> {
  const n = Number((await kv.get(key)) ?? "0");
  if (n >= max) return false;
  await kv.put(key, String(n + 1), { expirationTtl: ttlSeconds });
  return true;
}

function text(p: Payload, id: string): string {
  const parts = [p.description.trim() || "(sem descrição)"];
  if (p.diagnostics?.trim()) parts.push("", "Diagnóstico:", p.diagnostics.trim());
  parts.push("", `Versão ${p.appVersion} · ${p.platform}`, `Recibo ${id} · instalação ${p.installId.slice(0, 8)}`);
  return parts.join("\n");
}

async function sendEmail(p: Payload, id: string, env: Env, fetchFn: typeof fetch): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.FEEDBACK_TO || !env.FEEDBACK_FROM) return false;
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FEEDBACK_FROM,
      to: [env.FEEDBACK_TO],
      subject: `[UpVision Maker] ${p.kind}: ${p.title}`,
      text: text(p, id),
      attachments: p.image ? [{ filename: p.image.name, content: p.image.base64 }] : undefined,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

async function createIssue(p: Payload, id: string, env: Env, fetchFn: typeof fetch): Promise<boolean> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return false;
  const note = p.image ? `\n\n(Imagem ${p.image.name} anexada no e-mail.)` : "";
  const res = await fetchFn(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "upvision-feedback-worker", "Content-Type": "application/json" },
    body: JSON.stringify({ title: `${p.kind}: ${p.title}`, body: text(p, id) + note, labels: [p.kind.toLowerCase()] }),
  }).catch(() => null);
  return !!res?.ok;
}

export async function handle(req: Request, env: Env, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/feedback")) return json(404, { ok: false, error: "Não encontrado." });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Use POST." });
  if (!sameToken(req.headers.get("X-App-Token") ?? "", env.APP_TOKEN)) return json(401, { ok: false, error: "Não autorizado." });
  if (Number(req.headers.get("Content-Length") ?? "0") > MAX_BODY) return json(413, { ok: false, error: "Mensagem grande demais." });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: "Mensagem grande demais." });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "JSON inválido." });
  }
  const p = validate(parsed);
  if (typeof p === "string") return json(400, { ok: false, error: p });
  const ip = req.headers.get("CF-Connecting-IP") ?? "sem-ip";
  const hour = Math.floor(now / HOUR), day = Math.floor(now / DAY);
  if (!(await allow(env.RATE, `inst:${p.installId}:${hour}`, PER_INSTALL_HOUR, 2 * 3600)) || !(await allow(env.RATE, `ip:${ip}:${day}`, PER_IP_DAY, 2 * 86400)))
    return json(429, { ok: false, error: "Muitas mensagens seguidas." });
  const canEmail = !!(env.RESEND_API_KEY && env.FEEDBACK_TO && env.FEEDBACK_FROM), canIssue = !!(env.GITHUB_TOKEN && env.GITHUB_REPO);
  if (!canEmail && !canIssue) return json(503, { ok: false, error: "Entrega não configurada." });
  const id = crypto.randomUUID();
  const [emailed, issued] = await Promise.all([canEmail ? sendEmail(p, id, env, fetchFn) : false, canIssue ? createIssue(p, id, env, fetchFn) : false]);
  if (!emailed && !issued) return json(502, { ok: false, error: "Não consegui repassar a mensagem." });
  return json(200, { ok: true, id });
}
