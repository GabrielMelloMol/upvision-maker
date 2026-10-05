import type { z } from "zod";
import { FilamentInput, MaterialInput, PrinterInput, type WithId } from "../domain/entities";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "../domain/settings";
import { weightedAverage } from "../domain/stock";
import { salvage } from "./salvage";
import type { Db } from "./types";

/** CRUD de uma tabela. Só grava as colunas do schema (nada vindo de fora entra como coluna). */
function crud<S extends z.ZodObject>(table: string, schema: S) {
  type Row = WithId<z.infer<S>>;
  const cols = Object.keys(schema.shape);
  return {
    list: (db: Db) => db.select<Row>(`SELECT * FROM ${table} ORDER BY id`),
    /** Grava e devolve o id novo. */
    async insert(db: Db, input: unknown): Promise<number> {
      const v = schema.parse(input) as Record<string, unknown>;
      const r = await db.execute(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => v[c]),
      );
      return Number(r.lastInsertId);
    },
    async update(db: Db, id: number, input: unknown) {
      const v = schema.parse(input) as Record<string, unknown>;
      await db.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => v[c]), id]);
    },
    remove: (db: Db, id: number) => db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]),
  };
}

/** CRUD + reposição com custo médio ponderado. */
function stockCrud<S extends z.ZodObject>(table: string, schema: S, stockCol: string, priceCol: string) {
  return {
    ...crud(table, schema),
    async restock(db: Db, id: number, addQty: number, addPrice: number) {
      if (!(addQty > 0) || !(addPrice >= 0)) throw new Error("Quantidade deve ser maior que zero e preço não pode ser negativo.");
      const [row] = await db.select<Record<string, number>>(`SELECT ${stockCol} AS s, ${priceCol} AS p FROM ${table} WHERE id = ?`, [id]);
      if (!row) throw new Error("Item não encontrado.");
      const price = weightedAverage(row.s, row.p, addQty, addPrice);
      await db.execute(`UPDATE ${table} SET ${priceCol} = ?, ${stockCol} = ? WHERE id = ?`, [price, Math.max(row.s, 0) + addQty, id]);
    },
  };
}

export const printers = crud("printers", PrinterInput);
const round2g = (n: number) => Math.round(n * 100) / 100;

async function filamentStock(db: Db, id: number): Promise<{ stockG: number; spoolG: number }> {
  const [row] = await db.select<{ stockG: number; spoolG: number }>("SELECT stockG, spoolG FROM filaments WHERE id = ?", [id]);
  if (!row) throw new Error("Filamento não encontrado.");
  return row;
}

export const filaments = {
  ...stockCrud("filaments", FilamentInput, "stockG", "pricePerKg"),
  /** Baixa manual de gramas (ex.: leu o QR do rolo). Pode deixar o estoque negativo, como o consumo dos pedidos. Devolve o estoque novo. */
  async consume(db: Db, id: number, grams: number): Promise<number> {
    if (!Number.isFinite(grams) || grams <= 0) throw new Error("A quantidade precisa ser maior que zero.");
    const { stockG } = await filamentStock(db, id);
    const next = round2g(stockG - grams);
    await db.execute("UPDATE filaments SET stockG = ? WHERE id = ?", [next, id]);
    return next;
  },
  /**
   * "Rolo acabou": tira o que ainda constava do rolo aberto. O cadastro é por tipo (não por rolo), então o rolo aberto
   * é a sobra do estoque além dos rolos cheios; estoque redondo = o aberto era um rolo inteiro. Devolve o estoque novo.
   * ponytail: sem tabela de rolos; se ela passar a pesar rolos individuais, criar `spools` com o peso de cada um.
   */
  async finishSpool(db: Db, id: number): Promise<number> {
    const { stockG, spoolG } = await filamentStock(db, id);
    const rest = round2g(stockG % spoolG);
    const next = stockG <= 0 ? 0 : Math.max(0, round2g(stockG - (rest > 0 ? rest : spoolG)));
    await db.execute("UPDATE filaments SET stockG = ? WHERE id = ?", [next, id]);
    return next;
  },
};
export const materials = stockCrud("materials", MaterialInput, "stock", "unitPrice");

export async function loadSettings(db: Db): Promise<Settings> {
  const [row] = await db.select<{ data: string }>("SELECT data FROM settings WHERE id = 1");
  if (!row) return DEFAULT_SETTINGS;
  return salvage("preferências", SettingsSchema, DEFAULT_SETTINGS, row.data);
}

export async function saveSettings(db: Db, s: Settings): Promise<void> {
  const data = JSON.stringify(SettingsSchema.parse(s));
  await db.execute("INSERT INTO settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [data]);
}

export async function getSecret(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select<{ value: string }>("SELECT value FROM secrets WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSecret(db: Db, key: string, value: string): Promise<void> {
  await db.execute("INSERT INTO secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);
}

export const deleteSecret = (db: Db, key: string) => db.execute("DELETE FROM secrets WHERE key = ?", [key]);
