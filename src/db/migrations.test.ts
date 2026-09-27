import { expect, test } from "vitest";
import { migrate, SCHEMA_VERSION } from "./migrations";
import { memoryDb } from "./testDb";

test("migrate cria o schema e é idempotente", async () => {
  const db = memoryDb();
  await migrate(db);
  await migrate(db);
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(SCHEMA_VERSION);
});
