/** Prova de integridade de arquivo (#228): hash SHA-256 do arquivo, certificado com data e conferência offline. */

export type Certificate = {
  version: 1;
  /** SHA-256 do arquivo, 64 caracteres hexadecimais em minúsculas. */
  sha256: string;
  name: string;
  size: number;
  /** Quando o certificado foi emitido, ISO em UTC (o relógio do computador de quem emitiu). */
  at: string;
  author: string;
  title: string;
  contact: string;
  note: string;
};

const HEX64 = /^[0-9a-f]{64}$/;
const PAYLOAD_HEAD = "UPVISION-CERT/1";

/** SHA-256 de `bytes`, em hexadecimal. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Aceita o hash com espaços, hífens, dois-pontos ou maiúsculas ("sha256:AB CD…"); null se não tiver 64 hexadecimais. */
export function normalizeHash(raw: string): string | null {
  const h = raw.replace(/^\s*sha-?256\s*[:=]?/i, "").replace(/[\s:-]/g, "").toLowerCase();
  return HEX64.test(h) ? h : null;
}

/** Código curto para citar o certificado ("A1B2-C3D4-E5F6"): os 12 primeiros caracteres do hash. */
export const proofCode = (sha256: string) => (sha256.slice(0, 12).toUpperCase().match(/.{4}/g) ?? []).join("-");

/** O hash em grupos de 8 para ler e copiar à mão, em `lines` linhas. */
export function groupedHash(sha256: string, lines = 2): string[] {
  const groups = sha256.match(/.{8}/g) ?? [];
  const per = Math.ceil(groups.length / lines);
  return Array.from({ length: lines }, (_, i) => groups.slice(i * per, (i + 1) * per).join(" "));
}

/** Texto do QR do certificado: leva o hash, a data e o nome do arquivo (nada de servidor). */
export function certificatePayload(c: Pick<Certificate, "sha256" | "at" | "name">): string {
  return [PAYLOAD_HEAD, `sha256:${c.sha256}`, `at:${c.at}`, `name:${c.name.replace(/[\r\n]+/g, " ")}`].join("\n");
}

/** Lê o texto de um QR de certificado; null se não for. */
export function parsePayload(text: string): { sha256: string; at?: string; name?: string } | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== PAYLOAD_HEAD) return null;
  const field = (k: string) => lines.find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1);
  const sha256 = normalizeHash(field("sha256") ?? "");
  return sha256 ? { sha256, at: field("at"), name: field("name") } : null;
}

/** Os dados do certificado para guardar ao lado do arquivo e conferir depois. */
export const certificateJson = (c: Certificate) => JSON.stringify(c, null, 2);

/** Lê um certificado salvo (.json); null se não for um certificado válido. */
export function parseCertificateJson(text: string): Certificate | null {
  try {
    const o = JSON.parse(text) as Partial<Certificate>;
    const sha256 = typeof o.sha256 === "string" ? normalizeHash(o.sha256) : null;
    if (o.version !== 1 || !sha256) return null;
    return { version: 1, sha256, name: String(o.name ?? ""), size: Number(o.size) || 0, at: String(o.at ?? ""), author: String(o.author ?? ""), title: String(o.title ?? ""), contact: String(o.contact ?? ""), note: String(o.note ?? "") };
  } catch {
    return null;
  }
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** O arquivo bate com o hash do certificado? */
export function verify(fileHash: string, expected: string): Verdict {
  const want = normalizeHash(expected);
  if (!want) return { ok: false, reason: "O hash do certificado não é válido: precisa ter 64 letras e números (0 a 9, a a f)." };
  return fileHash === want ? { ok: true } : { ok: false, reason: "O arquivo é diferente do que recebeu o certificado: mudou depois da emissão ou é outro arquivo." };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Data e hora locais "15/10/2026 14:30". */
export const localStamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const bytesLabel = (n: number) => (n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1).replace(".", ",")} KB` : `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
