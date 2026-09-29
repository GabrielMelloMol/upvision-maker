import { beforeEach, expect, test } from "vitest";
import { calcHistory, HISTORY_MAX } from "./calcHistoryRepo";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const entry = (name: string, at: string) => ({ name, data: "{}", at, grams: 12.5, hours: 1.5, price: 30 });

test("salva, atualiza o mesmo cálculo, lista do mais novo e apaga (#43)", async () => {
  const a = await calcHistory.save(db, null, entry("Chaveiro", "2026-09-29T10:00:00Z"));
  const b = await calcHistory.save(db, null, entry("Vaso", "2026-09-29T11:00:00Z"));
  expect(await calcHistory.save(db, a, entry("Chaveiro coração", "2026-09-29T12:00:00Z"))).toBe(a);
  expect((await calcHistory.list(db)).map((x) => x.name)).toEqual(["Chaveiro coração", "Vaso"]);
  await calcHistory.remove(db, b);
  expect((await calcHistory.list(db)).map((x) => x.id)).toEqual([a]);
});

test("atualizar um cálculo apagado cria outro; guarda só os 20 mais recentes", async () => {
  const gone = await calcHistory.save(db, null, entry("x", "2026-01-01T00:00:00Z"));
  await calcHistory.remove(db, gone);
  await calcHistory.save(db, gone, entry("y", "2026-01-02T00:00:00Z"));
  expect((await calcHistory.list(db)).map((x) => x.name)).toEqual(["y"]);
  for (let i = 0; i < HISTORY_MAX + 5; i++) await calcHistory.save(db, null, entry(`n${i}`, `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
  const all = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM calc_history");
  expect(all[0].n).toBe(HISTORY_MAX);
  expect((await calcHistory.list(db))[0].name).toBe(`n${HISTORY_MAX + 4}`);
});

test("recusa dado inválido", async () => {
  await expect(calcHistory.save(db, null, { ...entry("a", "2026-01-01"), grams: -1 })).rejects.toThrow();
});
