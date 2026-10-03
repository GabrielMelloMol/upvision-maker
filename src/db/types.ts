/** Um comando SQL com parâmetros, para rodar em lote. */
export type Stmt = { sql: string; params?: unknown[] };

/** Subconjunto da API do tauri-plugin-sql que usamos (permite testar com node:sqlite). */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  /** Tudo numa transação só: o primeiro erro desfaz o lote inteiro (C1, A1). No app, comando Rust `sql_batch`. */
  batch(statements: Stmt[]): Promise<void>;
}
