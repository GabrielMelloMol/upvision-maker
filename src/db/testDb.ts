import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db } from "./types";

/** Db em memória para testes (Node ≥ 22). */
export function memoryDb(): Db {
  const db = new DatabaseSync(":memory:");
  const args = (p: unknown[] = []) => p as SQLInputValue[];
  return {
    select: async <T>(sql: string, p?: unknown[]) => db.prepare(sql).all(...args(p)) as T[],
    execute: async (sql, p) => {
      const r = db.prepare(sql).run(...args(p));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  };
}
