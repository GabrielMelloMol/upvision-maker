import { z } from "zod";
import type { Filament } from "../domain/entities";
import { WasteLine, wasteCost, WasteRunInput, type WasteRun } from "../domain/wasteRuns";
import type { ApplyStock, Movement } from "./stock";
import type { Db } from "./types";

type Row = Omit<WasteRun, "lines"> & { lines: string };

const readLines = (r: Row): WasteRun["lines"] => {
  try {
    const p = z.array(WasteLine).safeParse(JSON.parse(r.lines));
    if (p.success) return p.data;
    console.error(`Registro de perda ${r.id} com filamentos inválidos:`, p.error);
  } catch (e) {
    console.error(`Registro de perda ${r.id} com filamentos ilegíveis:`, e);
  }
  return [];
};

const movements = (lines: WasteRun["lines"], sign: 1 | -1): Movement[] => lines.map((l) => ({ kind: "filament", id: l.filamentId, delta: sign * l.grams }));

export const wasteRunsRepo = {
  async list(db: Db): Promise<WasteRun[]> {
    return (await db.select<Row>("SELECT * FROM waste_runs ORDER BY at DESC, id DESC")).map((r) => ({ ...r, lines: readLines(r) }));
  },

  /**
   * Registra a perda: grava o registro (com o custo pelos preços de hoje) e dá baixa nos filamentos. Se a baixa falhar, o
   * registro é desfeito, para o estoque e o Financeiro não ficarem em desacordo.
   */
  async create(db: Db, input: unknown, filaments: Pick<Filament, "id" | "pricePerKg">[], apply: ApplyStock): Promise<number> {
    const v = WasteRunInput.parse(input);
    const r = await db.execute("INSERT INTO waste_runs (kind, at, productId, printerId, lines, cost, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", [v.kind, v.at, v.productId, v.printerId, JSON.stringify(v.lines), wasteCost(v.lines, filaments), v.notes]);
    const id = Number(r.lastInsertId);
    try {
      await apply(movements(v.lines, -1));
    } catch (e) {
      await db.execute("DELETE FROM waste_runs WHERE id = ?", [id]);
      throw e;
    }
    return id;
  },

  /** Exclui o registro e devolve os gramas ao estoque. */
  async remove(db: Db, run: WasteRun, apply: ApplyStock): Promise<void> {
    await apply(movements(run.lines, 1));
    await db.execute("DELETE FROM waste_runs WHERE id = ?", [run.id]);
  },
};
