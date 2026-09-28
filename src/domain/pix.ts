/**
 * Pix estático "copia e cola" (BR Code, padrão EMV QRCPS-MPM do Banco Central).
 * Referência: Manual de Padrões para Iniciação do Pix (BCB), anexo "BR Code".
 */

export type PixInput = {
  /** CPF, CNPJ, telefone, e-mail ou chave aleatória; formatação é aceita (normalizePixKey). */
  key: string;
  /** Nome de quem recebe (até 25 caracteres, sem acento). */
  name: string;
  /** Cidade de quem recebe (até 15 caracteres, sem acento). */
  city: string;
  /** Valor em reais; sem valor, quem paga digita. */
  amount?: number;
  /** Identificador do pedido: até 25 letras/números. Padrão "***" (sem identificador). */
  txid?: string;
};

const GUI = "br.gov.bcb.pix";
const MAX_NAME = 25;
const MAX_CITY = 15;
const MAX_AMOUNT = 9_999_999_999.99;

const tlv = (id: string, value: string) => {
  if (value.length > 99) throw new Error(`Campo ${id} do Pix passou de 99 caracteres.`);
  return id + String(value.length).padStart(2, "0") + value;
};

/** Sem acentos e só ASCII imprimível (o BR Code não aceita outros caracteres). */
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();

/** CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexa maiúsculos. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(s)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const cpfOk = (d: string) => {
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
};

const cnpjOk = (d: string) => {
  if (/^(\d)\1{13}$/.test(d)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((t, x, i) => t + x * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Tira a formatação da chave: CPF/CNPJ só dígitos, telefone em +55DDDNÚMERO, e-mail e chave aleatória em minúsculas.
 * 11 dígitos sem "(" nem "+" são tratados como CPF (telefone precisa de DDD entre parênteses ou +55).
 */
export function normalizePixKey(raw: string): string {
  const k = raw.trim();
  if (UUID.test(k) || k.includes("@")) return k.toLowerCase();
  const digits = k.replace(/\D/g, "");
  if (/^[\d.\-/\s]+$/.test(k) && (digits.length === 11 || digits.length === 14) && !/\s/.test(k)) return digits;
  if (/^[\d\s()+-]+$/.test(k)) {
    if (k.startsWith("+")) return `+${digits}`;
    if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  }
  return k;
}

/** Normaliza e valida; lança Error com mensagem para a usuária. */
export function validPixKey(raw: string): string {
  const k = normalizePixKey(raw);
  if (!k) throw new Error("Informe a chave Pix.");
  if (/^\d{11}$/.test(k)) {
    if (!cpfOk(k)) throw new Error("CPF da chave Pix inválido: confira os números.");
    return k;
  }
  if (/^\d{14}$/.test(k)) {
    if (!cnpjOk(k)) throw new Error("CNPJ da chave Pix inválido: confira os números.");
    return k;
  }
  if (/^\+\d{12,13}$/.test(k) || UUID.test(k) || (EMAIL.test(k) && k.length <= 77)) return k;
  throw new Error("A chave Pix precisa ser CPF, CNPJ, telefone com DDD, e-mail ou chave aleatória.");
}

/** Monta o BR Code (texto do QR e do "copia e cola"). */
export function pixPayload({ key, name, city, amount, txid = "***" }: PixInput): string {
  const k = validPixKey(key);
  const n = ascii(name).slice(0, MAX_NAME).trim();
  const c = ascii(city).toUpperCase().slice(0, MAX_CITY).trim();
  if (!n) throw new Error("Informe o nome de quem recebe o Pix.");
  if (!c) throw new Error("Informe a cidade de quem recebe o Pix.");
  if (amount !== undefined && !(Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT)) throw new Error("O valor do Pix precisa ser maior que zero.");
  if (txid !== "***" && !/^[A-Za-z0-9]{1,25}$/.test(txid)) throw new Error("O identificador do Pix aceita só letras e números, até 25.");

  const body =
    tlv("00", "01") +
    tlv("26", tlv("00", GUI) + tlv("01", k)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amount !== undefined ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", n) +
    tlv("60", c) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return body + crc16(body);
}

/** Lê um nível de TLV ("id" → valor). Útil para conferir um BR Code. */
export function parseTlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 4 <= s.length; ) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}
