/** Novo custo unitário após uma compra: média ponderada entre saldo atual e quantidade comprada. */
export function weightedAverage(stock: number, price: number, addQty: number, addPrice: number): number {
  const base = Math.max(stock, 0);
  if (addQty <= 0) return price;
  return (base * price + addQty * addPrice) / (base + addQty);
}
