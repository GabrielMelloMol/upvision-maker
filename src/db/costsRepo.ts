import { OperationalCostInput, type OperationalCost } from "../domain/finance";
import type { Db } from "./types";

const COLS = Object.keys(OperationalCostInput.shape) as (keyof OperationalCostInput)[];

export const costsRepo = {
  list: (db: Db) => db.select<OperationalCost>("SELECT * FROM operational_costs ORDER BY startDate DESC, id DESC"),
  async insert(db: Db, input: unknown): Promise<number> {
    const v = OperationalCostInput.parse(input);
    if (v.endDate && v.endDate < v.startDate) throw new Error("A data final vem antes do início.");
    const r = await db.execute(`INSERT INTO operational_costs (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, COLS.map((c) => v[c]));
    return Number(r.lastInsertId);
  },
  async update(db: Db, id: number, input: unknown): Promise<void> {
    const v = OperationalCostInput.parse(input);
    if (v.endDate && v.endDate < v.startDate) throw new Error("A data final vem antes do início.");
    await db.execute(`UPDATE operational_costs SET ${COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...COLS.map((c) => v[c]), id]);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM operational_costs WHERE id = ?", [id]),
};
