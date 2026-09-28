import { beforeEach, expect, test } from "vitest";
import { addDays, isExpired, type QuoteInput } from "../domain/quotes";
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
