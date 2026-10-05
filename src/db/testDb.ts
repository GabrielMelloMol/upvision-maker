import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db, Stmt } from "./types";

const args = (p: unknown[] = []) => p as SQLInputValue[];

/** Lote numa transação, como o `sql_batch` do Rust (usado também pelos mocks do Tauri nos testes). */
export function runBatch(raw: DatabaseSync, statements: Stmt[]): void {
  raw.exec("BEGIN");
  try {
    for (const s of statements) raw.prepare(s.sql).run(...args(s.params));
    raw.exec("COMMIT");
  } catch (e) {
    raw.exec("ROLLBACK");
    throw e;
  }
}

/** Db sobre um node:sqlite já aberto. */
export function nodeDb(raw: DatabaseSync): Db {
  return {
    select: async <T>(sql: string, p?: unknown[]) => raw.prepare(sql).all(...args(p)) as T[],
    execute: async (sql, p) => {
      const r = raw.prepare(sql).run(...args(p));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
    batch: async (statements) => runBatch(raw, statements),
  };
}

/** Db em memória para testes (Node ≥ 22). */
export const memoryDb = (): Db => nodeDb(new DatabaseSync(":memory:"));

/** Como o `sync_adopt_strays` do Rust: arquivos "upvision-sync*.json" fora do nome oficial viram cópias de conflito. */
export function adoptStrays(folder: Map<string, string>, stamp: string): string[] {
  const out: string[] = [];
  let sec = Number(stamp.slice(15));
  for (const name of [...folder.keys()].sort()) {
    if (!name.startsWith("upvision-sync") || !name.endsWith(".json") || name === "upvision-sync.json") continue;
    const next = () => `upvision-conflito-${stamp.slice(0, 15)}${String(sec++ % 60).padStart(2, "0")}.json`;
    let target = next();
    while (folder.has(target)) target = next();
    folder.set(target, folder.get(name)!);
    folder.delete(name);
    out.push(target);
  }
  return out;
}
