import { ConsignmentInput, ConsignmentItem, type Consignment } from "../domain/consignments";
import { z } from "zod";
import type { Db } from "./types";

type Row = { id: number; customerId: number; customerName: string; startDate: string; periodDays: number; items: string; notes: string; active: number; lastRestockAt: string | null; createdAt: string };

/** Linha do banco → contrato; o JSON das peças que não lê vira lista vazia só nesse contrato (um registro ruim não derruba a lista). */
function toConsignment(r: Row): Consignment {
  let items: ConsignmentItem[] = [];
  try {
    const p = z.array(ConsignmentItem).safeParse(JSON.parse(r.items));
    if (p.success) items = p.data;
    else console.error(`Consignado ${r.id} com peças inválidas:`, p.error);
  } catch (e) {
    console.error(`Consignado ${r.id} com peças ilegíveis:`, e);
  }
  return { id: r.id, customerId: r.customerId, customerName: r.customerName, startDate: r.startDate, periodDays: r.periodDays, items, notes: r.notes, active: r.active !== 0, lastRestockAt: r.lastRestockAt, createdAt: r.createdAt };
}

export const consignmentsRepo = {
  async list(db: Db): Promise<Consignment[]> {
    return (await db.select<Row>("SELECT * FROM consignments ORDER BY active DESC, id DESC")).map(toConsignment);
  },

  async create(db: Db, input: unknown, createdAt: string): Promise<number> {
    const v = ConsignmentInput.parse(input);
    const r = await db.execute("INSERT INTO consignments (customerId, customerName, startDate, periodDays, items, notes, active, lastRestockAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?)", [v.customerId, v.customerName, v.startDate, v.periodDays, JSON.stringify(v.items), v.notes, createdAt]);
    return Number(r.lastInsertId);
  },

  /** Guarda o dia da reposição: o prazo da próxima conta daqui. */
  restocked: (db: Db, id: number, date: string) => db.execute("UPDATE consignments SET lastRestockAt = ? WHERE id = ?", [date, id]),

  setActive: (db: Db, id: number, active: boolean) => db.execute("UPDATE consignments SET active = ? WHERE id = ?", [active ? 1 : 0, id]),

  remove: (db: Db, id: number) => db.execute("DELETE FROM consignments WHERE id = ?", [id]),
};
