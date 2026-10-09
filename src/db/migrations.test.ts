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
  const last = MIGRATIONS.findIndex((m) => m.some((sql) => sql.includes("CREATE TABLE photos"))); // a versão das fotos: o índice do fim falha no 2º comando
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

test("migração do bico (0,4 mm): impressora que já existia fica com 0,4 e o cadastro novo aceita outro bico", async () => {
  // Arrange: banco na versão anterior ao bico, com uma impressora cadastrada
  const db = memoryDb();
  const nozzleVersion = MIGRATIONS.findIndex((m) => m.some((sql) => sql.includes("ADD COLUMN nozzle")));
  expect(nozzleVersion).toBeGreaterThan(0);
  for (let v = 0; v < nozzleVersion; v++) for (const sql of MIGRATIONS[v]) await db.execute(sql);
  await db.execute(`PRAGMA user_version = ${nozzleVersion}`);
  await db.execute("INSERT INTO printers (name, watts, price) VALUES ('Antiga', 95, 3000)");
  expect((await db.select<Record<string, unknown>>("SELECT * FROM printers"))[0]).not.toHaveProperty("nozzle");

  // Act
  await migrate(db);

  // Assert: a antiga ganhou 0,4; as novas aceitam outro bico
  expect(await db.select("SELECT name, price, nozzle FROM printers")).toEqual([{ name: "Antiga", price: 3000, nozzle: 0.4 }]);
  await db.execute("INSERT INTO printers (name, watts, nozzle) VALUES ('Fina', 80, 0.2)");
  expect(await db.select("SELECT name, nozzle FROM printers ORDER BY id")).toEqual([{ name: "Antiga", nozzle: 0.4 }, { name: "Fina", nozzle: 0.2 }]);
});
