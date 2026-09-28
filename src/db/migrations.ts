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
  [
    `CREATE TABLE customers (id INTEGER PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'pf', name TEXT NOT NULL, document TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', instagram TEXT NOT NULL DEFAULT '', cep TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '', number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '', district TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '', uf TEXT NOT NULL DEFAULT '', discountPct REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '')`,
    "CREATE TABLE company (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)",
  ],
  [
    `CREATE TABLE orders (id INTEGER PRIMARY KEY, customerId INTEGER, customerName TEXT NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', dueDate TEXT, deliveredAt TEXT, paymentMethod TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', freight REAL NOT NULL DEFAULT 0, stockApplied INTEGER NOT NULL DEFAULT 0, appliedPlan TEXT,
      createdAt TEXT NOT NULL, quoteId INTEGER)`,
    `CREATE TABLE order_items (id INTEGER PRIMARY KEY, orderId INTEGER NOT NULL, position INTEGER NOT NULL, productId INTEGER,
      description TEXT NOT NULL, qty REAL NOT NULL, unitPrice REAL NOT NULL, discountPct REAL NOT NULL DEFAULT 0,
      unitCost REAL NOT NULL DEFAULT 0, printMinutes REAL NOT NULL DEFAULT 0)`,
    "CREATE TABLE order_history (id INTEGER PRIMARY KEY, orderId INTEGER NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', at TEXT NOT NULL)",
    "CREATE INDEX order_items_order ON order_items (orderId)",
    "CREATE INDEX order_history_order ON order_history (orderId)",
  ],
  ["CREATE TABLE quotes (id INTEGER PRIMARY KEY, data TEXT NOT NULL, createdAt TEXT NOT NULL, convertedOrderId INTEGER)"],
  [
    `CREATE TABLE operational_costs (id INTEGER PRIMARY KEY, description TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL, frequency TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT, printerId INTEGER, notes TEXT NOT NULL DEFAULT '')`,
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
