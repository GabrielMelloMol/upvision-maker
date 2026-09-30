import type { Db } from "./types";

/** Numera, pela ordem de criação em cada ano, os orçamentos sem número (migração e backup antigo) e acerta os contadores. */
export const QUOTE_NUMBER_BACKFILL = [
  "UPDATE quotes SET year = CAST(substr(createdAt, 1, 4) AS INTEGER) WHERE year IS NULL",
  `UPDATE quotes SET seq = (SELECT COALESCE(MAX(q2.seq), 0) FROM quotes q2 WHERE q2.year = quotes.year AND q2.seq IS NOT NULL)
    + (SELECT COUNT(*) FROM quotes q3 WHERE q3.year = quotes.year AND q3.seq IS NULL AND q3.id <= quotes.id) WHERE seq IS NULL`,
  `INSERT INTO quote_numbers (id, seq) SELECT year, MAX(seq) FROM quotes WHERE year IS NOT NULL GROUP BY year
    ON CONFLICT(id) DO UPDATE SET seq = MAX(seq, excluded.seq)`,
];

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
  // Depreciação da impressora (#22): preço pago, vida útil em horas e desgaste por hora.
  [
    "ALTER TABLE printers ADD COLUMN price REAL NOT NULL DEFAULT 0",
    "ALTER TABLE printers ADD COLUMN lifeHours REAL NOT NULL DEFAULT 5000",
    "ALTER TABLE printers ADD COLUMN upkeepPerHour REAL NOT NULL DEFAULT 0",
  ],
  // Taxa de falha própria do produto (#35); NULL = a do material ou a geral.
  ["ALTER TABLE products ADD COLUMN failurePct REAL"],
  // Numeração de orçamentos por ano (#36): ORC-2026-001. quote_numbers.id = ano, seq = último número usado.
  [
    "ALTER TABLE quotes ADD COLUMN year INTEGER",
    "ALTER TABLE quotes ADD COLUMN seq INTEGER",
    "CREATE TABLE quote_numbers (id INTEGER PRIMARY KEY, seq INTEGER NOT NULL)",
    ...QUOTE_NUMBER_BACKFILL,
  ],
  // Histórico dos últimos cálculos da calculadora (#43); entra no backup.
  ["CREATE TABLE calc_history (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, at TEXT NOT NULL, grams REAL NOT NULL DEFAULT 0, hours REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0)"],
  // Variações próprias dos modelos prontos (#26): campos + camadas livres em JSON; entra no backup.
  ["CREATE TABLE model_variants (id INTEGER PRIMARY KEY, modelId TEXT NOT NULL, label TEXT NOT NULL, data TEXT NOT NULL, createdAt TEXT NOT NULL)"],
  // Anúncio e fiscal do produto, para a planilha de upload em massa dos marketplaces (#78). NULL = estimado/padrão.
  [
    "ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN ncm TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE products ADD COLUMN origin TEXT NOT NULL DEFAULT '0'",
    "ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'UN'",
    "ALTER TABLE products ADD COLUMN weightG REAL",
    "ALTER TABLE products ADD COLUMN boxL REAL",
    "ALTER TABLE products ADD COLUMN boxW REAL",
    "ALTER TABLE products ADD COLUMN boxH REAL",
  ],
  // Não perder trabalho (#85): estado atual de cada ferramenta e os últimos projetos exportados; entram no backup.
  [
    "CREATE TABLE tool_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt TEXT NOT NULL)",
    "CREATE TABLE tool_projects (id INTEGER PRIMARY KEY, toolId TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', data TEXT NOT NULL, thumb TEXT, at TEXT NOT NULL)",
  ],
  // Variações de produto (#82): nível (ex.: Cor) e as opções em JSON na própria linha, como a composição.
  ["ALTER TABLE products ADD COLUMN variationLabel TEXT NOT NULL DEFAULT 'Cor'", "ALTER TABLE products ADD COLUMN variants TEXT NOT NULL DEFAULT '[]'"],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    for (const sql of MIGRATIONS[v]) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${v + 1}`);
  }
}
