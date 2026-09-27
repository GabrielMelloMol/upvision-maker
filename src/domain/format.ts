/** Aceita "85,50", "85.50" ou "85". Retorna NaN se não for número. */
export function parseDecimal(s: string): number {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (n: number) => brl.format(n);
