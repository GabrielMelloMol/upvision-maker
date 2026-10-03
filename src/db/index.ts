import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { migrate } from "./migrations";
import type { Db, Stmt } from "./types";

export const DB_URL = "sqlite:upvision.db";

let ready: Promise<Db> | undefined;

/** O plugin não tem transação entre chamadas: o lote vai inteiro para o Rust (src-tauri/src/sqlbatch.rs). */
const batch = (statements: Stmt[]) => invoke<void>("sql_batch", { dbUrl: DB_URL, statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) });

/** Abre o SQLite do app (pasta de dados do usuário) e aplica migrações uma única vez. */
export function getDb(): Promise<Db> {
  ready ??= Database.load(DB_URL).then(async (raw) => {
    const db: Db = { select: (sql, p) => raw.select(sql, p), execute: (sql, p) => raw.execute(sql, p), batch };
    await migrate(db);
    return db;
  });
  return ready;
}
