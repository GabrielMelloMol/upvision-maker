export type NumberReading = { value: number; ambiguous: boolean; alt?: number };

const NOT_A_NUMBER: NumberReading = { value: NaN, ambiguous: false };
/** Parte inteira com milhar agrupado de 3 em 3 pelo separador dado ("1.234.567"); não começa com 0. */
const grouped = (s: string, sep: "." | ",") => new RegExp(`^[1-9]\\d{0,2}(\\${sep}\\d{3})+$`).test(s);

/**
 * A leitura de número de todos os campos (A5, M9, M12, B10): como se escreve no Brasil, milhar com ponto e decimal com
 * vírgula ("1.234,56"), aceitando também "1200", "1,2", "1200.5" e o americano "1,234.56". Quando dá para ler de
 * dois jeitos, fica a leitura brasileira, `ambiguous` liga e `alt` traz a outra, para o campo avisar:
 * "1.200" = 1200 (ou 1,2) e "1,500" = 1,5 (ou 1500). "0.856" é decimal: milhar não começa com 0. NaN se não é número.
 */
export function readNumber(raw: string): NumberReading {
  const s = raw.trim().replace(/[\s\u00a0\u202f]/g, "");
  const m = /^([-+]?)(\d*(?:[.,]\d+)*)$/.exec(s);
  if (!m || !/\d/.test(m[2])) return NOT_A_NUMBER;
  const sign = m[1] === "-" ? -1 : 1;
  const body = m[2];
  const reading = (value: number, ambiguous = false, alt?: number): NumberReading => ({ value: sign * value, ambiguous, ...(alt !== undefined && { alt: sign * alt }) });
  const [lastDot, lastComma] = [body.lastIndexOf("."), body.lastIndexOf(",")];
  if (lastDot < 0 && lastComma < 0) return reading(Number(body));
  if (lastDot >= 0 && lastComma >= 0) {
    // os dois: o último separa o decimal e o outro é o milhar
    const [dec, thou] = lastComma > lastDot ? (["," as const, "." as const]) : (["." as const, "," as const]);
    const cut = Math.max(lastDot, lastComma);
    const [int, frac] = [body.slice(0, cut), body.slice(cut + 1)];
    if (int.includes(dec) || !/^\d+$/.test(frac) || !(grouped(int, thou) || /^\d+$/.test(int))) return NOT_A_NUMBER;
    return reading(Number(`${int.split(thou).join("")}.${frac}`));
  }
  const sep = lastDot >= 0 ? "." : ",";
  const parts = body.split(sep);
  if (parts.length > 2) return grouped(body, sep) ? reading(Number(parts.join(""))) : NOT_A_NUMBER;
  const [int, frac] = parts;
  const asDecimal = Number(`${int || "0"}.${frac}`);
  const asThousands = /^[1-9]\d{0,2}$/.test(int) && frac.length === 3 ? Number(int + frac) : undefined;
  if (asThousands === undefined) return reading(asDecimal);
  // "1.200" no Brasil é mil e duzentos; "1,500" é um e meio
  return sep === "." ? reading(asThousands, true, asDecimal) : reading(asDecimal, true, asThousands);
}

/** Número de um campo (vírgula ou ponto, com ou sem milhar); NaN se não for número. Ver `readNumber`. */
export const parseDecimal = (s: string): number => readNumber(s).value;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (n: number) => brl.format(n);
