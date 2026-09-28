import { QuoteInput, quoteToOrderInput, type Quote } from "../domain/quotes";
import { ordersRepo } from "./ordersRepo";
import type { Db } from "./types";

type Row = { id: number; data: string; createdAt: string; convertedOrderId: number | null };

export const quotesRepo = {
  async list(db: Db): Promise<Quote[]> {
    const rows = await db.select<Row>("SELECT * FROM quotes ORDER BY id DESC");
    return rows.flatMap((r) => {
      const p = QuoteInput.safeParse(JSON.parse(r.data));
      if (!p.success) {
        console.error(`Orçamento ${r.id} inválido no banco:`, p.error);
        return [];
      }
      return [{ ...p.data, id: r.id, createdAt: r.createdAt, convertedOrderId: r.convertedOrderId }];
    });
  },
  async create(db: Db, input: unknown, now: string): Promise<number> {
    const v = QuoteInput.parse(input);
    const r = await db.execute("INSERT INTO quotes (data, createdAt, convertedOrderId) VALUES (?, ?, NULL)", [JSON.stringify(v), now]);
    return Number(r.lastInsertId);
  },
  async update(db: Db, q: Quote, input: unknown): Promise<void> {
    if (q.convertedOrderId) throw new Error(`Este orçamento já virou o pedido #${q.convertedOrderId}; edite o pedido.`);
    await db.execute("UPDATE quotes SET data = ? WHERE id = ?", [JSON.stringify(QuoteInput.parse(input)), q.id]);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM quotes WHERE id = ?", [id]),

  /** Converte em pedido uma única vez. */
  async convert(db: Db, q: Quote): Promise<number> {
    const [row] = await db.select<{ convertedOrderId: number | null }>("SELECT convertedOrderId FROM quotes WHERE id = ?", [q.id]);
    if (!row) throw new Error("Orçamento não encontrado.");
    if (row.convertedOrderId) throw new Error(`Este orçamento já virou o pedido #${row.convertedOrderId}.`);
    // se o app fechou entre criar o pedido e marcar o orçamento, o pedido já existe: só marca
    const [existing] = await db.select<{ id: number }>("SELECT id FROM orders WHERE quoteId = ?", [q.id]);
    if (existing) {
      await db.execute("UPDATE quotes SET convertedOrderId = ? WHERE id = ?", [existing.id, q.id]);
      throw new Error(`Este orçamento já virou o pedido #${existing.id}.`);
    }
    const orderId = await ordersRepo.create(db, quoteToOrderInput(q), q.id);
    await db.execute("UPDATE quotes SET convertedOrderId = ? WHERE id = ?", [orderId, q.id]);
    return orderId;
  },
};
