import { z } from "zod";
import type { Db } from "./types";

/** Quantos cálculos o histórico guarda (os mais antigos saem). */
export const HISTORY_MAX = 20;

/** Um cálculo da calculadora (#43). `data` = o formulário inteiro (JSON), para "Reabrir"; o resto é o resumo da lista. */
export const CalcHistoryInput = z.object({
  name: z.string().max(200),
  data: z.string(),
  at: z.string(),
  grams: z.number().min(0),
  hours: z.number().min(0),
  price: z.number().min(0),
});
export type CalcHistoryInput = z.infer<typeof CalcHistoryInput>;
export type CalcHistoryEntry = CalcHistoryInput & { id: number };

const COLS = Object.keys(CalcHistoryInput.shape);
const NEWEST = "ORDER BY at DESC, id DESC";

export const calcHistory = {
  list: (db: Db) => db.select<CalcHistoryEntry>(`SELECT * FROM calc_history ${NEWEST} LIMIT ?`, [HISTORY_MAX]),

  /** Atualiza o cálculo `id` (se ainda existir) ou cria um novo; mantém só os HISTORY_MAX mais recentes. Devolve o id. */
  async save(db: Db, id: number | null, input: CalcHistoryInput): Promise<number> {
    const v = CalcHistoryInput.parse(input) as Record<string, unknown>;
    const values = COLS.map((c) => v[c]);
    let saved = id;
    if (id !== null) {
      const r = await db.execute(`UPDATE calc_history SET ${COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...values, id]);
      if (r.rowsAffected === 0) saved = null; // apagado enquanto estava aberto: vira um novo
    }
    if (saved === null) {
      const r = await db.execute(`INSERT INTO calc_history (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, values);
      saved = Number(r.lastInsertId);
    }
    await db.execute(`DELETE FROM calc_history WHERE id NOT IN (SELECT id FROM calc_history ${NEWEST} LIMIT ?)`, [HISTORY_MAX]);
    return saved;
  },

  remove: (db: Db, id: number) => db.execute("DELETE FROM calc_history WHERE id = ?", [id]),
};
