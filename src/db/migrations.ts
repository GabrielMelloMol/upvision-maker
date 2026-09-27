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
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    for (const sql of MIGRATIONS[v]) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${v + 1}`);
  }
}
