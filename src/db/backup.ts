import { z } from "zod";
import { QUOTE_NUMBER_BACKFILL, SCHEMA_VERSION } from "./migrations";
import { LegacyProductPhoto, TABLES, type TableName } from "./tables";
import type { Db, Stmt } from "./types";

const APP = "upvision-maker";

const BackupSchema = z.object({
  app: z.literal(APP),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  /** Backup feito sem as fotos (#162, para ficar leve): restaurar mantém as fotos que já estão no app. */
  photosOmitted: z.boolean().optional(),
  tables: z
    .object(
      Object.fromEntries(Object.entries(TABLES).map(([k, s]) => [k, z.array(s).default([])])) as {
        [K in TableName]: z.ZodDefault<z.ZodArray<(typeof TABLES)[K]>>;
      },
    )
    // antes da #162 as fotos de produto ficavam em product_photos
    .extend({ product_photos: z.array(LegacyProductPhoto).default([]) }),
});
export type Backup = z.infer<typeof BackupSchema>;

const names = Object.keys(TABLES) as TableName[];

/**
 * `photos: false` deixa as fotos de fora (backup leve, #162). A sincronização entre computadores (#16) e a cópia de
 * segurança antes de restaurar usam o padrão, com fotos.
 */
export async function exportBackup(db: Db, { photos = true }: { photos?: boolean } = {}): Promise<Backup> {
  const tables = { product_photos: [] } as unknown as Backup["tables"];
  for (const t of names) (tables as Record<string, unknown>)[t] = t === "photos" && !photos ? [] : await db.select(`SELECT * FROM ${t} ORDER BY id`);
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), ...(photos ? {} : { photosOmitted: true }), tables };
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

/** Linhas da tabela no backup; fotos de backup antigo vêm de product_photos (dono "product:<id>"). */
function rowsOf(backup: Backup, t: TableName): Record<string, unknown>[] {
  if (t !== "photos" || backup.tables.photos.length || !backup.tables.product_photos.length) return backup.tables[t] as Record<string, unknown>[];
  return backup.tables.product_photos.map((p) => ({ id: p.id, owner: `product:${p.productId}`, position: p.position, dataUrl: p.dataUrl, createdAt: backup.exportedAt }));
}

/** Substitui todos os dados pelos do backup, numa transação só: se algo falhar, nada muda (C1). */
export async function restoreBackup(db: Db, backup: Backup): Promise<void> {
  const statements: Stmt[] = [];
  for (const t of names) {
    if (t === "photos" && backup.photosOmitted) continue; // backup leve: as fotos do app ficam
    statements.push({ sql: `DELETE FROM ${t}` });
    const cols = Object.keys(TABLES[t].shape);
    const sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    for (const row of rowsOf(backup, t)) statements.push({ sql, params: cols.map((c) => row[c] ?? null) });
  }
  for (const sql of QUOTE_NUMBER_BACKFILL) statements.push({ sql }); // backup antigo: orçamentos sem número
  await db.batch(statements);
}
