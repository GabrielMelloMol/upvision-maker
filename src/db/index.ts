import Database from "@tauri-apps/plugin-sql";
import { migrate } from "./migrations";
import type { Db } from "./types";

let ready: Promise<Db> | undefined;

/** Abre o SQLite do app (pasta de dados do usuário) e aplica migrações uma única vez. */
export function getDb(): Promise<Db> {
  ready ??= Database.load("sqlite:upvision.db").then(async (db) => {
    await migrate(db);
    return db;
  });
  return ready;
}
