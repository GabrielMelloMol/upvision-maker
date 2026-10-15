/** Preço do filamento quando nada no estoque dá a cor nem a média (PLA comum, R$/kg). */
export const DEFAULT_PRICE_PER_KG = 100;

/** Preço usado para uma cor sem filamento cadastrado: a média do estoque, ou o padrão sem estoque nenhum. */
export function fallbackPricePerKg(stock: { pricePerKg: number }[]): number {
  const priced = stock.filter((f) => f.pricePerKg > 0);
  return priced.length ? priced.reduce((s, f) => s + f.pricePerKg, 0) / priced.length : DEFAULT_PRICE_PER_KG;
}
