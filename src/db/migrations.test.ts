import { expect, test } from "vitest";
import { MIGRATIONS, migrate, SCHEMA_VERSION } from "./migrations";
import { memoryDb } from "./testDb";

test("migrate cria o schema e é idempotente", async () => {
  const db = memoryDb();
  await migrate(db);
  await migrate(db);
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(SCHEMA_VERSION);
});

test("migração interrompida no meio de uma versão não deixa o banco pela metade (A1)", async () => {
  // Arrange: banco na penúltima versão e um obstáculo que faz o 2º comando da última versão falhar
  const db = memoryDb();
  const last = SCHEMA_VERSION - 1;
  for (let v = 0; v < last; v++) for (const sql of MIGRATIONS[v]) await db.execute(sql);
  await db.execute(`PRAGMA user_version = ${last}`);
  await db.execute("CREATE TABLE obstaculo (x)");
  await db.execute("CREATE INDEX photos_owner ON obstaculo (x)");

  // Act
  await expect(migrate(db)).rejects.toThrow();

  // Assert: nada da última versão ficou aplicado, e a próxima abertura consegue migrar
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(last);
  expect(await db.select("SELECT name FROM sqlite_master WHERE name = 'photos'")).toEqual([]);
  await db.execute("DROP INDEX photos_owner");
  await migrate(db);
  const [{ user_version: after }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(after).toBe(SCHEMA_VERSION);
});
