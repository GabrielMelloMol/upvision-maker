import { breakdown } from "./finance";
import type { Order } from "./orders";
import type { Product } from "./products";

/*
 * Reposição sugerida pelo ritmo de vendas (#215): quanto imprimir de cada produto para cobrir os próximos dias de
 * venda mais o que já está prometido em pedidos abertos, arredondado para mesas cheias (o app imprime por mesa).
 */
export const WINDOW_DAYS = 30; // janela de vendas olhada
export const COVER_OPTIONS = [7, 14, 30] as const;
export const DEFAULT_COVER_DAYS = 14;
const OPEN = new Set(["pending", "production", "done"]); // ainda não entregues
const URGENT_DAYS = 3; // estoque que acaba em até 3 dias é crítico

export type RestockLevel = "ok" | "warn" | "critical";
export type RestockRow = {
  product: Product;
  sold: number; // vendidos (entregues) na janela
  perDay: number;
  stock: number;
  committed: number; // quantidade em pedidos abertos
  target: number; // quanto convém ter: ritmo × dias de cobertura + comprometido (ou o mínimo do cadastro)
  toPrint: number; // peças a imprimir, em mesas cheias (0 = nada)
  plates: number;
  daysLeft: number | null; // dias de venda que o estoque cobre ao ritmo atual (sem contar os pedidos abertos)
  level: RestockLevel;
  reason: "ritmo" | "pedidos" | "mínimo" | null; // o que puxa a sugestão
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/** Sugestões por produto, das mais urgentes para as menos. Produto sem venda, sem pedido e sem mínimo não entra. */
export function restockSuggestions(orders: Order[], products: Product[], today: string, coverDays = DEFAULT_COVER_DAYS): RestockRow[] {
  const sold = new Map(breakdown(orders, shift(today, -WINDOW_DAYS), today, (_o, i) => String(i.productId ?? "")).map((b) => [b.key, b.qty]));
  const committed = new Map<string, number>();
  for (const o of orders)
    if (OPEN.has(o.status)) for (const i of o.items) if (i.productId) committed.set(String(i.productId), (committed.get(String(i.productId)) ?? 0) + i.qty);
  const rows: RestockRow[] = [];
  for (const product of products) {
    const key = String(product.id);
    const qty = sold.get(key) ?? 0;
    const open = committed.get(key) ?? 0;
    if (!qty && !open && !product.minStock) continue;
    const perDay = qty / WINDOW_DAYS;
    const byRate = Math.ceil(perDay * coverDays) + open;
    const target = Math.max(byRate, product.minStock);
    const missing = Math.max(0, Math.ceil(target - product.stock));
    const perPlate = Math.max(1, product.piecesPerPlate);
    const plates = Math.ceil(missing / perPlate);
    const daysLeft = perDay > 0 ? Math.floor(Math.max(0, product.stock) / perDay) : null;
    const short = product.stock < open; // nem os pedidos abertos saem do estoque
    const level: RestockLevel = !missing ? "ok" : short || (daysLeft !== null && daysLeft <= URGENT_DAYS) ? "critical" : "warn";
    const reason = !missing ? null : byRate >= product.minStock ? (open > Math.ceil(perDay * coverDays) ? "pedidos" : "ritmo") : "mínimo";
    rows.push({ product, sold: qty, perDay, stock: product.stock, committed: open, target, toPrint: plates * perPlate, plates, daysLeft, level, reason });
  }
  const rank = { critical: 0, warn: 1, ok: 2 } as const;
  return rows.sort((a, b) => rank[a.level] - rank[b.level] || b.toPrint - a.toPrint || b.sold - a.sold);
}

/** Dias entre duas datas ISO (para os testes e a tela). */
export const daysSince = daysBetween;
