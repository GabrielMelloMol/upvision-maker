import type { Db } from "./types";

/** Cada item é uma versão do schema. Nunca editar um item já publicado: só acrescentar. */
export const MIGRATIONS: string[][] = [
  ["CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)"],
  [
    "CREATE TABLE printers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, watts REAL NOT NULL DEFAULT 0)",
    `CREATE TABLE filaments (id INTEGER PRIMARY KEY, material TEXT NOT NULL, color TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '', pricePerKg REAL NOT NULL, spoolG REAL NOT NULL DEFAULT 1000,
      stockG REAL NOT NULL DEFAULT 0, minG REAL NOT NULL DEFAULT 0)`,
    `CREATE TABLE materials (id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'un',
      unitPrice REAL NOT NULL, stock REAL NOT NULL DEFAULT 0, min REAL NOT NULL DEFAULT 0)`,
  ],
  // Segredos (ex.: chave da API) ficam só neste computador: a tabela não entra no backup.
  ["CREATE TABLE secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL)"],
  [
    `CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'simple',
      composition TEXT NOT NULL, printerId INTEGER, printMinutes REAL NOT NULL DEFAULT 0, laborMinutes REAL NOT NULL DEFAULT 0,
      piecesPerPlate INTEGER NOT NULL DEFAULT 1, freight REAL NOT NULL DEFAULT 0, manualPrice REAL, consignmentPrice REAL,
      stock REAL NOT NULL DEFAULT 0, minStock REAL NOT NULL DEFAULT 0, sku TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '')`,
    "CREATE TABLE product_photos (id INTEGER PRIMARY KEY, productId INTEGER NOT NULL, position INTEGER NOT NULL, dataUrl TEXT NOT NULL)",
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    for (const sql of MIGRATIONS[v]) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${v + 1}`);
  }
}
