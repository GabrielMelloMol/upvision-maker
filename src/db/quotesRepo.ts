import { QuoteInput, quoteToOrderInput, type Quote } from "../domain/quotes";
import { ordersRepo } from "./ordersRepo";
import type { Db } from "./types";

type Row = { id: number; data: string; createdAt: string; convertedOrderId: number | null; year: number | null; seq: number | null };

export const quotesRepo = {
  async list(db: Db): Promise<Quote[]> {
    const rows = await db.select<Row>("SELECT * FROM quotes ORDER BY id DESC");
    return rows.map((r) => {
      const meta = { id: r.id, createdAt: r.createdAt, convertedOrderId: r.convertedOrderId, year: r.year, seq: r.seq };
      let p: ReturnType<typeof QuoteInput.safeParse> | null = null;
      try {
        p = QuoteInput.safeParse(JSON.parse(r.data));
      } catch (e) {
        console.error(`Orçamento ${r.id} com dados quebrados:`, e);
      }
      if (p?.success) return { ...p.data, ...meta };
      if (p) console.error(`Orçamento ${r.id} inválido no banco:`, p.error);
      // M16: não some da lista (a numeração pareceria pular): fica marcado e só dá para excluir
      return {
        customerId: null, customerName: "(cliente ilegível)", channel: "", dueDate: null, paymentMethod: "", notes: "", freight: 0,
        items: [], validUntil: "9999-12-31", terms: "", ...meta,
        unreadable: "Este orçamento não pôde ser lido (dado antigo ou estragado). Exclua-o e refaça se precisar.",
      };
    });
  },
  async create(db: Db, input: unknown, now: string): Promise<number> {
    const v = QuoteInput.parse(input);
    // ponytail: contador e insert sem transação (pool do plugin); dois orçamentos no mesmo instante não acontecem num app de 1 pessoa
    const parsed = Number(now.slice(0, 4));
    const year = Number.isInteger(parsed) && parsed > 2000 ? parsed : new Date().getFullYear();
    await db.execute("INSERT INTO quote_numbers (id, seq) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET seq = seq + 1", [year]);
    const [{ seq }] = await db.select<{ seq: number }>("SELECT seq FROM quote_numbers WHERE id = ?", [year]);
    const r = await db.execute("INSERT INTO quotes (data, createdAt, convertedOrderId, year, seq) VALUES (?, ?, NULL, ?, ?)", [JSON.stringify(v), now, year, seq]);
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
