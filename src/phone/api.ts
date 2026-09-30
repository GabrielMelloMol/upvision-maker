import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { getDb } from "../db";
import { ordersRepo } from "../db/ordersRepo";
import { filaments } from "../db/repo";
import { applyStock } from "../db/stock";
import type { Db } from "../db/types";
import { logError } from "../diagnostics/log";
import { isLate, STATUS_LABEL, todayIso, type OrderStatus } from "../domain/orders";
import { loadOrdersData } from "../pages/orders/data";
import type { PhoneSummary } from "./types";

/**
 * API do celular (#16), respondida pela janela do app com os mesmos repositórios do computador.
 * O Rust (lan.rs) já conferiu rede local, endereço e sessão antes de chegar aqui.
 */
export type PhoneRequest = { method: string; path: string; body: string };
export type PhoneResponse = { status: number; body: unknown };

const OPEN: OrderStatus[] = ["pending", "production", "done"];
const FINISHABLE: OrderStatus[] = ["pending", "production"];
const ConsumeBody = z.object({ grams: z.number().positive("A quantidade precisa ser maior que zero.").max(10_000, "Quantidade grande demais.") });

async function summary(db: Db): Promise<PhoneSummary> {
  const data = await loadOrdersData(db);
  const today = todayIso();
  const orders = data.orders
    .filter((o) => OPEN.includes(o.status))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.id - b.id)
    .map((o) => ({
      id: o.id,
      customer: o.customerName,
      dueDate: o.dueDate,
      status: STATUS_LABEL[o.status],
      late: isLate(o, today),
      items: o.items.map((i) => `${i.qty}× ${i.description}`).join(", "),
      canFinish: FINISHABLE.includes(o.status),
    }));
  const spools = data.filaments.map((f) => ({ id: f.id, name: [f.material, f.color, f.brand].filter(Boolean).join(" "), stockG: f.stockG, minG: f.minG, low: f.stockG <= f.minG }));
  return { orders, filaments: spools };
}

async function finishOrder(db: Db, id: number) {
  const data = await loadOrdersData(db);
  const order = data.orders.find((o) => o.id === id);
  if (!order) return { status: 404, body: { error: "Pedido não encontrado." } };
  if (!FINISHABLE.includes(order.status)) return { status: 409, body: { error: `Este pedido já está ${STATUS_LABEL[order.status].toLowerCase()}.` } };
  await ordersRepo.changeStatus(order, "done", data, applyStock);
  return { status: 200, body: { ok: true } };
}

async function consume(db: Db, id: number, body: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { status: 400, body: { error: "Pedido inválido." } };
  }
  const v = ConsumeBody.safeParse(raw);
  if (!v.success) return { status: 400, body: { error: v.error.issues[0]?.message ?? "Quantidade inválida." } };
  if (!(await filaments.list(db)).some((f) => f.id === id)) return { status: 404, body: { error: "Filamento não encontrado." } };
  return { status: 200, body: { stockG: await filaments.consume(db, id, v.data.grams) } };
}

export async function handlePhone(db: Db, req: PhoneRequest): Promise<PhoneResponse> {
  try {
    if (req.method === "GET" && req.path === "/api/summary") return { status: 200, body: await summary(db) };
    let m = /^\/api\/orders\/([1-9]\d{0,9})\/done$/.exec(req.path);
    if (req.method === "POST" && m) return await finishOrder(db, Number(m[1]));
    m = /^\/api\/filaments\/([1-9]\d{0,9})\/consume$/.exec(req.path);
    if (req.method === "POST" && m) return await consume(db, Number(m[1]), req.body);
    return { status: 404, body: { error: "Não encontrado." } };
  } catch (e) {
    logError("celular", e);
    return { status: 500, body: { error: e instanceof Error ? e.message : "Algo deu errado no computador." } };
  }
}

/** Uma chamada de cada vez, na ordem de chegada: dois toques em "Marcar pronto" não baixam o estoque duas vezes. */
export function oneAtATime<A>(fn: (a: A) => Promise<unknown>): (a: A) => Promise<void> {
  let queue: Promise<void> = Promise.resolve();
  return (a) => (queue = queue.then(() => fn(a)).then(() => undefined, (e) => logError("celular", e)));
}

/** Liga a janela ao servidor do celular: cada `lan-request` do Rust vira uma resposta. */
export function installPhoneBridge(): () => void {
  const respond = oneAtATime(async (p: PhoneRequest & { id: number }) => {
    const r = await handlePhone(await getDb(), p);
    await invoke("lan_respond", { id: p.id, status: r.status, body: JSON.stringify(r.body) });
  });
  const off = listen<PhoneRequest & { id: number }>("lan-request", ({ payload }) => void respond(payload));
  return () => void off.then((f) => f()).catch(() => {});
}
