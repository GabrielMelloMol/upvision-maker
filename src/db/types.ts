/** Subconjunto da API do tauri-plugin-sql que usamos (permite testar com node:sqlite). */
export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}
