import { beforeEach, expect, test } from "vitest";
import { addDays, isExpired, quoteNumber, type QuoteInput } from "../domain/quotes";
import { MIGRATIONS } from "./migrations";
import { migrate } from "./migrations";
import { ordersRepo } from "./ordersRepo";
import { quotesRepo } from "./quotesRepo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const quote: QuoteInput = {
  customerId: null,
  customerName: "Ana",
  channel: "Consumidor final",
  dueDate: "2026-10-20",
  paymentMethod: "Pix",
  notes: "Cor azul",
  freight: 10,
  validUntil: "2026-10-05",
  terms: "50% na aprovação",
  items: [{ productId: null, description: "Topo de bolo personalizado", qty: 1, unitPrice: 45, discountPct: 0, unitCost: 8, printMinutes: 90 }],
};

test("converte em pedido uma única vez, levando itens, frete e prazo", async () => {
  const id = await quotesRepo.create(db, quote, "2026-09-28 10:00:00");
  const [q] = await quotesRepo.list(db);
  const orderId = await quotesRepo.convert(db, q);
  const [o] = await ordersRepo.list(db);
  expect(o.id).toBe(orderId);
  expect(o.quoteId).toBe(id);
  expect(o).toMatchObject({ customerName: "Ana", freight: 10, dueDate: "2026-10-20", notes: "Cor azul" });
  expect(o.items[0].description).toBe("Topo de bolo personalizado");
  expect((await ordersRepo.history(db, orderId))[0].note).toBe(`Criado a partir do orçamento #${id}`);
  await expect(quotesRepo.convert(db, q)).rejects.toThrow(/já virou o pedido/);
  expect(await ordersRepo.list(db)).toHaveLength(1);
});

test("orçamento convertido não pode ser editado", async () => {
  await quotesRepo.create(db, quote, "agora");
  await quotesRepo.convert(db, (await quotesRepo.list(db))[0]);
  await expect(quotesRepo.update(db, (await quotesRepo.list(db))[0], quote)).rejects.toThrow(/edite o pedido/);
});

test("validade: soma dias e marca vencido só se não virou pedido", () => {
  expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
  expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  expect(isExpired({ validUntil: "2026-10-01", convertedOrderId: null }, "2026-10-02")).toBe(true);
  expect(isExpired({ validUntil: "2026-10-01", convertedOrderId: 3 }, "2026-10-02")).toBe(false);
});

test("pedido criado mas orçamento não marcado (app fechou no meio): não duplica", async () => {
  await quotesRepo.create(db, quote, "agora");
  const [q] = await quotesRepo.list(db);
  await ordersRepo.create(db, { ...quote, validUntil: undefined, terms: undefined }, q.id);
  await expect(quotesRepo.convert(db, q)).rejects.toThrow(/já virou o pedido #1/);
  expect((await quotesRepo.list(db))[0].convertedOrderId).toBe(1);
  expect(await ordersRepo.list(db)).toHaveLength(1);
});

test("numeração por ano (#36): sequência própria de cada ano e nunca reaproveita número de orçamento excluído", async () => {
  const a = await quotesRepo.create(db, quote, "2026-01-10 10:00:00");
  const b = await quotesRepo.create(db, quote, "2026-03-01 10:00:00");
  await quotesRepo.remove(db, b);
  const c = await quotesRepo.create(db, quote, "2026-05-01 10:00:00");
  const d = await quotesRepo.create(db, quote, "2027-01-02 10:00:00");
  const byId = Object.fromEntries((await quotesRepo.list(db)).map((q) => [q.id, quoteNumber(q, "ORC")]));
  expect(byId).toEqual({ [a]: "ORC-2026-001", [c]: "ORC-2026-003", [d]: "ORC-2027-001" });
});

test("número formatado com o prefixo da empresa; sem número (dado antigo) cai no id", () => {
  expect(quoteNumber({ id: 7, year: 2026, seq: 12 }, "UPV")).toBe("UPV-2026-012");
  expect(quoteNumber({ id: 7, year: null, seq: null }, "ORC")).toBe("ORC-7");
});

test("migração numera os orçamentos que já existiam pelo ano de criação", async () => {
  const old = (await import("./testDb")).memoryDb();
  // banco parado logo antes da migração da numeração (#36), mesmo com migrações novas depois dela
  const numbering = MIGRATIONS.findIndex((step) => step.some((sql) => sql.includes("CREATE TABLE quote_numbers")));
  for (const step of MIGRATIONS.slice(0, numbering)) for (const sql of step) await old.execute(sql);
  await old.execute(`PRAGMA user_version = ${numbering}`);
  for (const at of ["2025-12-30 10:00:00", "2026-01-02 10:00:00", "2026-02-01 10:00:00"])
    await old.execute("INSERT INTO quotes (data, createdAt, convertedOrderId) VALUES (?, ?, NULL)", [JSON.stringify(quote), at]);
  await migrate(old);
  expect((await quotesRepo.list(old)).map((q) => quoteNumber(q, "ORC")).sort()).toEqual(["ORC-2025-001", "ORC-2026-001", "ORC-2026-002"]);
  const next = await quotesRepo.create(old, quote, "2026-03-01 10:00:00");
  expect(quoteNumber((await quotesRepo.list(old)).find((q) => q.id === next)!, "ORC")).toBe("ORC-2026-003");
});
