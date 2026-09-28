import type { z } from "zod";
import { FilamentInput, MaterialInput, PrinterInput, type WithId } from "../domain/entities";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "../domain/settings";
import { weightedAverage } from "../domain/stock";
import type { Db } from "./types";

/** CRUD de uma tabela. Só grava as colunas do schema (nada vindo de fora entra como coluna). */
function crud<S extends z.ZodObject>(table: string, schema: S) {
  type Row = WithId<z.infer<S>>;
  const cols = Object.keys(schema.shape);
  return {
    list: (db: Db) => db.select<Row>(`SELECT * FROM ${table} ORDER BY id`),
    async insert(db: Db, input: unknown) {
      const v = schema.parse(input) as Record<string, unknown>;
      await db.execute(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => v[c]),
      );
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
export const filaments = stockCrud("filaments", FilamentInput, "stockG", "pricePerKg");
export const materials = stockCrud("materials", MaterialInput, "stock", "unitPrice");

export async function loadSettings(db: Db): Promise<Settings> {
  const [row] = await db.select<{ data: string }>("SELECT data FROM settings WHERE id = 1");
  if (!row) return DEFAULT_SETTINGS;
  const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...JSON.parse(row.data) });
  if (!parsed.success) {
    console.error("Preferências inválidas no banco, usando padrão:", parsed.error);
    return DEFAULT_SETTINGS;
  }
  return parsed.data;
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
