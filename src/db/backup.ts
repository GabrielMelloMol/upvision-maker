import { z } from "zod";
import { QUOTE_NUMBER_BACKFILL, SCHEMA_VERSION } from "./migrations";
import { TABLES, type TableName } from "./tables";
import type { Db } from "./types";

const APP = "upvision-maker";

const BackupSchema = z.object({
  app: z.literal(APP),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  tables: z.object(
    Object.fromEntries(Object.entries(TABLES).map(([k, s]) => [k, z.array(s).default([])])) as {
      [K in TableName]: z.ZodDefault<z.ZodArray<(typeof TABLES)[K]>>;
    },
  ),
});
export type Backup = z.infer<typeof BackupSchema>;

const names = Object.keys(TABLES) as TableName[];

export async function exportBackup(db: Db): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const t of names) (tables as Record<string, unknown>)[t] = await db.select(`SELECT * FROM ${t} ORDER BY id`);
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Valida o arquivo inteiro antes de qualquer escrita no banco. */
export function parseBackup(json: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Este arquivo não é um backup do UpVision Maker.");
  }
  const head = z.object({ app: z.literal(APP), schemaVersion: z.number() }).safeParse(raw);
  if (!head.success) throw new Error("Este arquivo não é um backup do UpVision Maker.");
  if (head.data.schemaVersion > SCHEMA_VERSION) {
    throw new Error("Este backup veio de uma versão mais nova do app. Atualize o app antes de restaurar.");
  }
  const full = BackupSchema.safeParse(raw);
  if (!full.success) throw new Error(`Backup corrompido: ${full.error.issues[0]?.path.join(".")} inválido.`);
  return full.data;
}

/** Substitui todos os dados pelos do backup. */
export async function restoreBackup(db: Db, backup: Backup): Promise<void> {
  // ponytail: sem transação (o pool do tauri-plugin-sql não garante a mesma conexão entre chamadas);
  // o backup já foi validado e a UI salva uma cópia de segurança antes. Mover para comando Rust se precisar de atomicidade.
  for (const t of names) {
    await db.execute(`DELETE FROM ${t}`);
    const cols = Object.keys(TABLES[t].shape);
    const sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    for (const row of backup.tables[t] as Record<string, unknown>[]) {
      await db.execute(sql, cols.map((c) => row[c] ?? null));
    }
  }
  for (const sql of QUOTE_NUMBER_BACKFILL) await db.execute(sql); // backup antigo: orçamentos sem número
}
