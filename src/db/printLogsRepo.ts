import { ownerOf, photos } from "./photosRepo";
import { PrintLogInput, type PrintLog } from "../domain/printLogs";
import type { Db } from "./types";

/** Ficha de impressão (#163). `brim` fica 0/1 no SQLite. */
const COLS = Object.keys(PrintLogInput.shape) as (keyof PrintLogInput)[];
type Row = Omit<PrintLog, "brim"> & { brim: number };
const fromRow = (r: Row): PrintLog => ({ ...r, brim: r.brim !== 0 });
const values = (v: PrintLogInput) => COLS.map((c) => (c === "brim" ? (v.brim ? 1 : 0) : v[c]));

export const printLogsRepo = {
  async list(db: Db): Promise<PrintLog[]> {
    return (await db.select<Row>("SELECT * FROM print_logs ORDER BY at DESC, id DESC")).map(fromRow);
  },
  async forProduct(db: Db, productId: number): Promise<PrintLog[]> {
    return (await db.select<Row>("SELECT * FROM print_logs WHERE productId = ? ORDER BY at DESC, id DESC", [productId])).map(fromRow);
  },
  async insert(db: Db, input: unknown): Promise<number> {
    const v = PrintLogInput.parse(input);
    const r = await db.execute(`INSERT INTO print_logs (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, values(v));
    return Number(r.lastInsertId);
  },
  async update(db: Db, id: number, input: unknown): Promise<void> {
    const v = PrintLogInput.parse(input);
    await db.execute(`UPDATE print_logs SET ${COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...values(v), id]);
  },
  /** Apaga a impressão e as fotos dela (#162). */
  async remove(db: Db, id: number): Promise<void> {
    await photos.removeOwner(db, ownerOf("print", id));
    await db.execute("DELETE FROM print_logs WHERE id = ?", [id]);
  },
};
