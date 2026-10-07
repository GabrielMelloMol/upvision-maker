// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setupTauri } from "../test/harness";
import { handlePhone, oneAtATime } from "./api";
import type { PhoneSummary } from "./types";

const t = setupTauri();
let changes: { status: string; orderId: number }[];

beforeEach(async () => {
  changes = [];
  t.handlers["apply_stock"] = (a) => {
    const o = a.order as { orderId: number; status: string };
    changes.push(o);
    t.raw.prepare("UPDATE orders SET status = ? WHERE id = ?").run(o.status, o.orderId);
    return null;
  };
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Preto', 'Voolt', 100, 1000, 800, 200), ('PETG', 'Azul', '', 120, 1000, 150, 200)");
  const order = (name: string, status: string, due: string | null) =>
    t.db.execute("INSERT INTO orders (customerName, channel, dueDate, paymentMethod, notes, freight, status, createdAt) VALUES (?, 'direto', ?, 'pix', '', 0, ?, '2026-09-01 10:00:00')", [name, due, status]);
  await order("Ana", "pending", "2026-10-10");
  await order("Bia", "production", "2020-01-01");
  await order("Caio", "delivered", "2026-09-01");
  await t.db.execute("INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, discountPct, unitCost, printMinutes) VALUES (1, 0, NULL, 'Chaveiro', 2, 10, 0, 3, 30)");
});

const call = (method: string, path: string, body: unknown = "") => handlePhone(t.db, { method, path, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("API do celular (#16)", () => {
  test("resumo: pedidos em aberto por prazo (atrasado primeiro), sem os entregues, e o estoque de filamento", async () => {
    const r = await call("GET", "/api/summary");
    expect(r.status).toBe(200);
    const s = r.body as PhoneSummary;
    expect(s.orders.map((o) => [o.customer, o.late])).toEqual([
      ["Bia", true],
      ["Ana", false],
    ]);
    expect(s.orders[1]).toMatchObject({ items: "2× Chaveiro", status: "Pendente", canFinish: true });
    expect(s.filaments).toEqual([
      { id: 1, name: "PLA Preto Voolt", stockG: 800, minG: 200, low: false },
      { id: 2, name: "PETG Azul", stockG: 150, minG: 200, low: true },
    ]);
  });

  test("marcar pronto passa pelo mesmo caminho do computador (estoque junto)", async () => {
    expect((await call("POST", "/api/orders/1/done")).status).toBe(200);
    expect(changes).toEqual([expect.objectContaining({ orderId: 1, status: "done" })]);
    expect(await call("POST", "/api/orders/1/done")).toMatchObject({ status: 409 });
    expect(await call("POST", "/api/orders/99/done")).toMatchObject({ status: 404 });
  });

  test("dar baixa de filamento valida a quantidade", async () => {
    expect(await call("POST", "/api/filaments/1/consume", { grams: 35.5 })).toEqual({ status: 200, body: { stockG: 764.5 } });
    expect(await call("POST", "/api/filaments/1/consume", { grams: 0 })).toMatchObject({ status: 400 });
    expect(await call("POST", "/api/filaments/1/consume", { grams: "10" })).toMatchObject({ status: 400 });
    expect(await call("POST", "/api/filaments/1/consume", "{quebrado")).toMatchObject({ status: 400 });
    expect(await call("POST", "/api/filaments/9/consume", { grams: 5 })).toMatchObject({ status: 404 });
  });

  test("rotas e métodos desconhecidos: 404", async () => {
    expect((await call("GET", "/api/orders/1/done")).status).toBe(404);
    expect((await call("POST", "/api/orders/../secrets")).status).toBe(404);
    expect((await call("DELETE", "/api/summary")).status).toBe(404);
  });
});

describe("erro interno no computador (B28)", () => {
  test("o celular recebe uma mensagem genérica; o detalhe (caminho, SQL) vai só para o registro do computador", async () => {
    const broken = { select: () => Promise.reject(new Error("no such table: orders em C:\\Users\\Ana\\AppData\\upvision.db")), execute: t.db.execute, batch: t.db.batch };

    const r = await handlePhone(broken, { method: "GET", path: "/api/summary", body: "" });

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/no such table|AppData|upvision\.db/);
    expect(r.body).toEqual({ error: "Algo deu errado no computador. Tente de novo; se continuar, veja o registro de erros no app." });
    await vi.waitFor(() => expect(t.log.join("\n")).toContain("no such table")); // o detalhe fica no registro
  });
});

describe("fila dos pedidos do celular (#16)", () => {
  test("um de cada vez: dois toques em Marcar pronto baixam o estoque uma vez só", async () => {
    const statuses: number[] = [];
    const run = oneAtATime(async (path: string) => statuses.push((await call("POST", path)).status));
    await Promise.all([run("/api/orders/1/done"), run("/api/orders/1/done")]);
    expect(statuses).toEqual([200, 409]);
    expect(changes).toHaveLength(1);
  });

  test("um erro não trava a fila", async () => {
    const seen: number[] = [];
    const run = oneAtATime(async (n: number) => {
      if (n === 1) throw new Error("falhou");
      seen.push(n);
    });
    await Promise.all([run(1), run(2)]);
    expect(seen).toEqual([2]);
  });
});
