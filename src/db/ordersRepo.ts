import { OrderInput, STATUS_LABEL, todayIso, transition, planForOrder, type Order, type OrderItem, type OrderStatus } from "../domain/orders";
import type { ConsumptionPlan, ProductCtx } from "../domain/products";
import { planToMovements, type ApplyStock } from "./stock";
import type { Db, Stmt } from "./types";

type OrderRow = Omit<Order, "items" | "stockApplied" | "appliedPlan"> & { stockApplied: number; appliedPlan: string | null };
type ItemRow = OrderItem & { id: number; orderId: number; position: number };
export type HistoryEntry = { id: number; orderId: number; status: string; note: string; at: string };

const ORDER_COLS = ["customerId", "customerName", "channel", "dueDate", "paymentMethod", "notes", "freight"] as const;
const ITEM_COLS = ["productId", "description", "qty", "unitPrice", "discountPct", "unitCost", "printMinutes", "custom"] as const;

const nowLocal = () => {
  const d = new Date();
  return `${todayIso(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

/** Um INSERT por item, para entrar no mesmo lote (transação) do pedido. */
const itemStatements = (orderId: number, items: OrderItem[]): Stmt[] =>
  items.map((it, i) => ({
    sql: `INSERT INTO order_items (orderId, position, ${ITEM_COLS.join(", ")}) VALUES (?, ?, ${ITEM_COLS.map(() => "?").join(", ")})`,
    params: [orderId, i, ...ITEM_COLS.map((c) => it[c])],
  }));

const sameItems = (a: OrderItem[], b: OrderItem[]) => JSON.stringify(a.map((i) => [i.productId, i.qty])) === JSON.stringify(b.map((i) => [i.productId, i.qty]));

export const ordersRepo = {
  async list(db: Db): Promise<Order[]> {
    const orders = await db.select<OrderRow>("SELECT * FROM orders ORDER BY id DESC");
    const items = await db.select<ItemRow>("SELECT * FROM order_items ORDER BY orderId, position");
    const byOrder = new Map<number, ItemRow[]>();
    for (const it of items) byOrder.set(it.orderId, [...(byOrder.get(it.orderId) ?? []), it]);
    return orders.map((o) => ({
      ...o,
      stockApplied: o.stockApplied !== 0,
      appliedPlan: o.appliedPlan ? (JSON.parse(o.appliedPlan) as ConsumptionPlan) : null,
      items: (byOrder.get(o.id) ?? []).map((it) => ({ id: it.id, ...Object.fromEntries(ITEM_COLS.map((c) => [c, it[c]])) }) as OrderItem & { id: number }),
    }));
  },

  history: (db: Db, orderId: number) => db.select<HistoryEntry>("SELECT * FROM order_history WHERE orderId = ? ORDER BY id", [orderId]),

  // Pedido, itens e histórico vão num lote só (transação no Rust, M7): fechar o app no meio não deixa pedido sem itens.
  // O estoque não é tocado aqui. O id é escolhido antes (MAX+1) para os itens entrarem no mesmo lote; se outro
  // processo pegar o mesmo id, o INSERT falha e o lote inteiro é desfeito.
  async create(db: Db, input: unknown, quoteId: number | null = null): Promise<number> {
    const v = OrderInput.parse(input);
    const [{ next }] = await db.select<{ next: number }>("SELECT COALESCE(MAX(id), 0) + 1 AS next FROM orders");
    const id = Number(next);
    await db.batch([
      {
        sql: `INSERT INTO orders (id, ${ORDER_COLS.join(", ")}, status, createdAt, quoteId) VALUES (?, ${ORDER_COLS.map(() => "?").join(", ")}, 'pending', ?, ?)`,
        params: [id, ...ORDER_COLS.map((c) => v[c]), nowLocal(), quoteId],
      },
      ...itemStatements(id, v.items),
      { sql: "INSERT INTO order_history (orderId, status, note, at) VALUES (?, 'pending', ?, ?)", params: [id, quoteId ? `Criado a partir do orçamento #${quoteId}` : "Pedido criado", nowLocal()] },
    ]);
    return id;
  },

  async update(db: Db, order: Order, input: unknown): Promise<void> {
    const v = OrderInput.parse(input);
    if (order.stockApplied && !sameItems(order.items, v.items)) throw new Error("O estoque deste pedido já foi baixado. Volte para Pendente para mudar produtos ou quantidades.");
    await db.batch([
      { sql: `UPDATE orders SET ${ORDER_COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, params: [...ORDER_COLS.map((c) => v[c]), order.id] },
      { sql: "DELETE FROM order_items WHERE orderId = ?", params: [order.id] },
      ...itemStatements(order.id, v.items),
    ]);
  },

  /** Muda o status; baixa ou estorna o estoque na mesma transação (comando Rust). */
  async changeStatus(order: Order, to: OrderStatus, ctx: ProductCtx, apply: ApplyStock): Promise<void> {
    if (order.status === to) return;
    const { stock } = transition(order.status, to, order.stockApplied);
    const plan = stock === "apply" ? planForOrder(order.items, ctx) : null;
    const movements = plan ? planToMovements(plan, -1) : stock === "revert" && order.appliedPlan ? planToMovements(order.appliedPlan, 1) : [];
    const applied = stock === "apply" ? true : stock === "revert" ? false : order.stockApplied;
    const note = stock === "apply" ? "Estoque baixado" : stock === "revert" ? "Estoque devolvido" : "";
    await apply(movements, {
      orderId: order.id,
      expectApplied: order.stockApplied,
      setApplied: applied,
      status: to,
      note: [STATUS_LABEL[to], note].filter(Boolean).join(" · "),
      appliedPlan: plan ? JSON.stringify(plan) : applied ? JSON.stringify(order.appliedPlan) : null,
      deliveredAt: to === "delivered" ? (order.deliveredAt ?? todayIso()) : null,
    });
  },

  /** Exclui; se o estoque já tinha sido baixado, devolve tudo na mesma transação. */
  async remove(order: Order, apply: ApplyStock): Promise<void> {
    const movements = order.stockApplied && order.appliedPlan ? planToMovements(order.appliedPlan, 1) : [];
    await apply(movements, { orderId: order.id, expectApplied: order.stockApplied, setApplied: false, status: order.status, note: "", appliedPlan: null, deliveredAt: null, delete: true });
  },
};
