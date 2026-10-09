import { beforeEach, describe, expect, test } from "vitest";
import type { OrderInput } from "../domain/orders";
import { EMPTY_PRODUCT } from "../domain/products";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { exportBackup, parseBackup } from "./backup";
import { migrate } from "./migrations";
import { ordersRepo } from "./ordersRepo";
import { productsRepo } from "./productsRepo";
import { filaments } from "./repo";
import type { ApplyStock } from "./stock";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;

/** Mesmo contrato do comando Rust apply_stock (src-tauri/src/stock.rs), sobre o banco de teste. */
const fakeApply: ApplyStock = async (movements, o) => {
  if (o) {
    const [row] = await db.select<{ stockApplied: number }>("SELECT stockApplied FROM orders WHERE id = ?", [o.orderId]);
    if (!row) throw new Error("Pedido não encontrado.");
    if ((row.stockApplied !== 0) !== o.expectApplied) throw new Error("O estoque deste pedido já foi atualizado por outra ação.");
  }
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  for (const m of movements) await db.execute(`UPDATE ${col[m.kind][0]} SET ${col[m.kind][1]} = ${col[m.kind][1]} + ? WHERE id = ?`, [m.delta, m.id]);
  if (!o) return;
  if (o.delete) {
    for (const t of ["order_items WHERE orderId", "order_history WHERE orderId", "orders WHERE id"]) await db.execute(`DELETE FROM ${t} = ?`, [o.orderId]);
    return;
  }
  await db.execute("UPDATE orders SET stockApplied = ?, status = ?, appliedPlan = ?, deliveredAt = ? WHERE id = ?", [o.setApplied ? 1 : 0, o.status, o.appliedPlan, o.deliveredAt, o.orderId]);
  await db.execute("INSERT INTO order_history (orderId, status, note, at) VALUES (?, ?, ?, 'agora')", [o.orderId, o.status, o.note]);
};

let productId: number;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
  await filaments.insert(db, { material: "PLA", color: "", brand: "", pricePerKg: 100, spoolG: 1000, stockG: 1000, minG: 0 });
  productId = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Chaveiro", stock: 1, composition: { filaments: [{ filamentId: 1, grams: 10 }], materials: [], items: [] } });
});

const ctx = async () => ({ filaments: await filaments.list(db), materials: [], printers: [], products: await productsRepo.list(db), settings: DEFAULT_SETTINGS });
const input = (qty: number): OrderInput => ({
  customerId: null,
  customerName: "Ana",
  channel: "Consumidor final",
  dueDate: "2026-10-05",
  paymentMethod: "Pix",
  notes: "",
  freight: 0,
  items: [{ productId, description: "Chaveiro", qty, unitPrice: 15, discountPct: 0, unitCost: 1, printMinutes: 10, custom: "" }],
});
const stockG = async () => (await filaments.list(db))[0].stockG;
const productStock = async () => (await productsRepo.list(db))[0].stock;
const order = async () => (await ordersRepo.list(db))[0];

describe("pagamento (#177)", () => {
  test("começa a receber; registra sinal e pago, limita ao total e deixa no histórico", async () => {
    await ordersRepo.create(db, input(4)); // 4 × 15 = 60
    expect((await order()).paidAmount).toBe(0);
    await ordersRepo.setPaid(db, await order(), 20);
    expect((await order()).paidAmount).toBe(20);
    await ordersRepo.setPaid(db, await order(), 999);
    expect((await order()).paidAmount).toBe(60);
    await expect(ordersRepo.setPaid(db, await order(), -1)).rejects.toThrow(/zero/);
    const notes = (await ordersRepo.history(db, (await order()).id)).map((h) => h.note);
    expect(notes.slice(1)).toEqual(["Pagamento: recebido 20,00 de 60,00", "Pagamento: pago por inteiro"]);
  });

  test("o valor pago entra no backup e na restauração; backup antigo sem o campo volta como a receber", async () => {
    await ordersRepo.create(db, input(4));
    await ordersRepo.setPaid(db, await order(), 25);
    const raw = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(raw.tables.orders[0].paidAmount).toBe(25);
    delete raw.tables.orders[0].paidAmount;
    await ordersRepo.setPaid(db, await order(), 0);
    const { restoreBackup } = await import("./backup");
    await restoreBackup(db, parseBackup(JSON.stringify(raw)));
    expect((await order()).paidAmount).toBe(0);
  });

  test("a migração marca como pagos os pedidos já entregues e deixa os outros a receber", async () => {
    const old = memoryDb();
    const { MIGRATIONS } = await import("./migrations");
    const paidAt = MIGRATIONS.findIndex((m) => m.some((sql) => sql.includes("paidAmount")));
    for (const [i, stmts] of MIGRATIONS.slice(0, paidAt).entries()) {
      for (const sql of stmts) await old.execute(sql);
      await old.execute(`PRAGMA user_version = ${i + 1}`);
    }
    await old.execute("INSERT INTO orders (id, customerName, channel, status, freight, createdAt) VALUES (1, 'A', 'x', 'delivered', 10, 'h'), (2, 'B', 'x', 'pending', 0, 'h')");
    await old.execute("INSERT INTO order_items (orderId, position, description, qty, unitPrice, discountPct) VALUES (1, 0, 'a', 3, 10.5, 10), (2, 0, 'b', 1, 5, 0)");
    await migrate(old);
    const rows = await old.select<{ id: number; paidAmount: number }>("SELECT id, paidAmount FROM orders ORDER BY id");
    expect(rows).toEqual([{ id: 1, paidAmount: 38.35 }, { id: 2, paidAmount: 0 }]);
  });
});

describe("pedidos", () => {
  test("cria com itens e histórico", async () => {
    await ordersRepo.create(db, input(3));
    const o = await order();
    expect(o.status).toBe("pending");
    expect(o.items).toHaveLength(1);
    expect(await ordersRepo.history(db, o.id)).toHaveLength(1);
  });

  test("confirmar baixa o estoque (pronto primeiro) e guarda o plano; cancelar devolve exatamente o mesmo", async () => {
    await ordersRepo.create(db, input(3));
    await ordersRepo.changeStatus(await order(), "production", await ctx(), fakeApply);
    expect(await productStock()).toBe(0);
    expect(await stockG()).toBe(980);
    expect((await order()).stockApplied).toBe(true);
    // composição muda depois da baixa: o estorno usa o plano guardado, não a composição nova
    const p = (await productsRepo.list(db))[0];
    await productsRepo.update(db, p.id, { ...p, composition: { filaments: [{ filamentId: 1, grams: 999 }], materials: [], items: [] } });
    await ordersRepo.changeStatus(await order(), "canceled", await ctx(), fakeApply);
    expect(await stockG()).toBe(1000);
    expect(await productStock()).toBe(1);
    expect((await order()).stockApplied).toBe(false);
    expect((await ordersRepo.history(db, (await order()).id)).map((h) => h.note)).toEqual(["Pedido criado", "Em produção · Estoque baixado", "Cancelado · Estoque devolvido"]);
  });

  test("entregue grava a data de entrega (receita do mês)", async () => {
    await ordersRepo.create(db, input(1));
    await ordersRepo.changeStatus(await order(), "delivered", await ctx(), fakeApply);
    expect((await order()).deliveredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("não baixa duas vezes se a tela estiver desatualizada", async () => {
    await ordersRepo.create(db, input(1));
    const stale = await order();
    await ordersRepo.changeStatus(stale, "production", await ctx(), fakeApply);
    await expect(ordersRepo.changeStatus(stale, "done", await ctx(), fakeApply)).rejects.toThrow(/outra ação/);
    expect(await productStock()).toBe(0);
  });

  test("com estoque baixado, mudar produtos/quantidades exige voltar para pendente", async () => {
    await ordersRepo.create(db, input(1));
    await ordersRepo.changeStatus(await order(), "production", await ctx(), fakeApply);
    await expect(ordersRepo.update(db, await order(), input(5))).rejects.toThrow(/Pendente/);
    await ordersRepo.update(db, await order(), { ...input(1), notes: "embrulhar para presente" });
    expect((await order()).notes).toBe("embrulhar para presente");
  });

  test("excluir pedido confirmado devolve o estoque e apaga itens e histórico", async () => {
    await ordersRepo.create(db, input(3));
    await ordersRepo.changeStatus(await order(), "production", await ctx(), fakeApply);
    await ordersRepo.remove(await order(), fakeApply);
    expect(await stockG()).toBe(1000);
    expect(await ordersRepo.list(db)).toEqual([]);
    expect(await db.select("SELECT * FROM order_items")).toEqual([]);
  });

  test("pedidos entram no backup", async () => {
    await ordersRepo.create(db, input(2));
    const b = parseBackup(JSON.stringify(await exportBackup(db)));
    expect(b.tables.orders).toHaveLength(1);
    expect(b.tables.order_items).toHaveLength(1);
    expect(b.tables.order_history).toHaveLength(1);
  });
});

describe("M7: pedido e itens numa transação só", () => {
  const two = (): OrderInput => ({ ...input(1), items: [input(1).items[0], { ...input(2).items[0], description: "Segundo" }] });
  /** O 2º item não entra (como app fechado ou banco travado no meio da gravação). */
  const failSecondItem = () => db.execute("CREATE TRIGGER falha BEFORE INSERT ON order_items WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'banco travou'); END");

  test("criar que falha no meio não deixa pedido sem itens nem histórico", async () => {
    await failSecondItem();
    await expect(ordersRepo.create(db, two())).rejects.toThrow(/banco travou/);
    expect(await db.select("SELECT id FROM orders")).toEqual([]);
    expect(await db.select("SELECT id FROM order_items")).toEqual([]);
    expect(await db.select("SELECT id FROM order_history")).toEqual([]);
  });

  test("editar que falha no meio mantém o pedido e os itens como estavam", async () => {
    await ordersRepo.create(db, two());
    const before = await order();
    await failSecondItem();
    await expect(ordersRepo.update(db, before, { ...two(), customerName: "Outra", notes: "mudou" })).rejects.toThrow(/banco travou/);
    const after = await order();
    expect(after.customerName).toBe("Ana");
    expect(after.items.map((i) => i.description)).toEqual(["Chaveiro", "Segundo"]);
  });

  test("criar devolve o id e grava itens na ordem; do orçamento, com a nota certa", async () => {
    const id = await ordersRepo.create(db, two());
    expect((await order()).id).toBe(id);
    expect((await order()).items.map((i) => i.description)).toEqual(["Chaveiro", "Segundo"]);
    const id2 = await ordersRepo.create(db, input(1), 7);
    expect(id2).toBe(id + 1);
    expect((await ordersRepo.history(db, id2))[0].note).toBe("Criado a partir do orçamento #7");
  });
});

describe("M15: um pedido ilegível não derruba a lista", () => {
  test("appliedPlan corrompido: o pedido aparece e os outros também; devolver o estoque dele avisa em vez de ignorar", async () => {
    await ordersRepo.create(db, input(1));
    await ordersRepo.create(db, input(2));
    await db.execute("UPDATE orders SET stockApplied = 1, appliedPlan = '{quebrado' WHERE id = 1");
    const list = await ordersRepo.list(db);
    expect(list.map((o) => o.id)).toEqual([2, 1]);
    const bad = list.find((o) => o.id === 1)!;
    expect(bad.appliedPlan).toBeNull();
    await expect(ordersRepo.changeStatus(bad, "canceled", await ctx(), fakeApply)).rejects.toThrow(/plano de baixa.*ilegível/);
  });
});
