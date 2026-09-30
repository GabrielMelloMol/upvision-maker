import { beforeEach, expect, test } from "vitest";
import { FilamentInput } from "../domain/entities";
import { migrate } from "./migrations";
import { filaments } from "./repo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const pla = { material: "PLA", color: "Branco", brand: "X", pricePerKg: 80, spoolG: 1000, stockG: 500, minG: 200 };

test("TD do filamento (#100): grava, edita e fica vazio (null) quando não informado, inclusive em backup antigo", async () => {
  await filaments.insert(db, { ...pla, td: 3.2 });
  await filaments.insert(db, pla);
  const [a, b] = await filaments.list(db);
  expect(a.td).toBe(3.2);
  expect(b.td).toBeNull();
  await filaments.update(db, a.id, { ...pla, td: null });
  expect((await filaments.list(db))[0].td).toBeNull();
  expect(FilamentInput.parse(pla).td).toBeNull();
  expect(() => FilamentInput.parse({ ...pla, td: 50 })).toThrow();
});
