import { beforeEach, expect, test } from "vitest";
import { toCsv } from "../domain/csv";
import { costsRepo } from "./costsRepo";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const base = { description: "Parcela da A1", category: "Máquinas", amount: 250, frequency: "monthly" as const, startDate: "2026-01-05", endDate: "2026-10-05", printerId: 1, notes: "" };

test("custos: salva, lista, edita e exclui; recusa fim antes do início e valor zero", async () => {
  const id = await costsRepo.insert(db, base);
  expect((await costsRepo.list(db))[0]).toMatchObject({ id, amount: 250, printerId: 1 });
  await costsRepo.update(db, id, { ...base, amount: 300 });
  expect((await costsRepo.list(db))[0].amount).toBe(300);
  await expect(costsRepo.insert(db, { ...base, endDate: "2025-01-01" })).rejects.toThrow(/antes do início/);
  await expect(costsRepo.insert(db, { ...base, amount: 0 })).rejects.toThrow();
  await costsRepo.remove(db, id);
  expect(await costsRepo.list(db)).toEqual([]);
});

test("CSV: ponto e vírgula, vírgula decimal, aspas escapadas e BOM", () => {
  const csv = toCsv([["Cliente", "Total"], ['Loja "Bia"; Centro', 12.5], ["Ana", null]]);
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toBe('﻿Cliente;Total\r\n"Loja ""Bia""; Centro";12,5\r\nAna;\r\n');
});
