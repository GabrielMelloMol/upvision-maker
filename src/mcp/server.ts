import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { getDb } from "../db";
import { costsRepo } from "../db/costsRepo";
import { customersRepo, loadCompany } from "../db/customersRepo";
import { ordersRepo } from "../db/ordersRepo";
import { quotesRepo } from "../db/quotesRepo";
import type { Db } from "../db/types";
import { wasteRunsRepo } from "../db/wasteRunsRepo";
import { logError } from "../diagnostics/log";
import { EMPTY_CUSTOMER } from "../domain/customers";
import { financeSummary, periodRange } from "../domain/finance";
import { CONSUMER, orderTotals, todayIso } from "../domain/orders";
import { addDays, isExpired, quoteNumber } from "../domain/quotes";
import { oneAtATime, summary } from "../phone/api";

/**
 * Conector de IA (MCP, #304): JSON-RPC 2.0 do Model Context Protocol, respondido pela janela do app.
 * O Rust (mcp.rs) já conferiu a chave, o endereço e que veio deste computador.
 * Só consulta e cria (cliente, orçamento): nada apaga, muda pedido ou mexe em dinheiro.
 */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD.");

type Tool = { name: string; description: string; readOnly: boolean; input: z.ZodType; schema: object; run: (db: Db, args: never) => Promise<unknown> };

const tool = <S extends z.ZodType>(name: string, description: string, readOnly: boolean, input: S, schema: object, run: (db: Db, args: z.infer<S>) => Promise<unknown>): Tool =>
  ({ name, description, readOnly, input, schema, run: run as Tool["run"] });

const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const NewCustomer = z.object({
  nome: z.string().trim().min(1).max(120),
  telefone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  instagram: z.string().trim().max(60).optional(),
  observacoes: z.string().trim().max(1000).optional(),
});

const NewQuote = z.object({
  cliente: z.string().trim().min(1).max(120),
  cliente_id: z.number().int().positive().optional(),
  itens: z.array(z.object({ descricao: z.string().trim().min(1).max(200), quantidade: z.number().positive().max(100_000), preco_unitario: z.number().min(0).max(1_000_000) })).min(1).max(50),
  frete: z.number().min(0).max(100_000).optional(),
  observacoes: z.string().trim().max(2000).optional(),
  cor: z.string().trim().max(60).optional(),
  tamanho: z.string().trim().max(60).optional(),
});

export const TOOLS: Tool[] = [
  tool("pedidos_e_estoque", "Pedidos em aberto (com prazo e atraso) e estoque de cada filamento.", true, z.object({}), obj({}), (db) => summary(db)),
  tool(
    "buscar_clientes",
    "Procura clientes pelo nome, telefone ou Instagram. Sem busca, lista os 20 primeiros.",
    true,
    z.object({ busca: z.string().trim().max(120).optional() }),
    obj({ busca: { type: "string", description: "Parte do nome, telefone ou Instagram." } }),
    async (db, { busca }) => {
      const q = (busca ?? "").toLowerCase();
      return (await customersRepo.list(db))
        .filter((c) => !q || [c.name, c.phone, c.instagram].some((f) => f.toLowerCase().includes(q)))
        .slice(0, 20)
        .map((c) => ({ id: c.id, nome: c.name, telefone: c.phone, email: c.email, instagram: c.instagram, cidade: c.city, ativo: c.active }));
    },
  ),
  tool("listar_orcamentos", "Os orçamentos mais recentes, com número, cliente, total e situação.", true, z.object({ limite: z.number().int().min(1).max(50).optional() }), obj({ limite: { type: "integer", minimum: 1, maximum: 50 } }), async (db, { limite }) => {
    const company = await loadCompany(db);
    return (await quotesRepo.list(db)).slice(0, limite ?? 10).map((q) => ({
      numero: quoteNumber(q, company.quotePrefix),
      cliente: q.customerName,
      total: orderTotals(q.items, q.freight).total,
      validade: q.validUntil,
      situacao: q.unreadable ? "ilegível" : q.convertedOrderId ? `virou o pedido #${q.convertedOrderId}` : isExpired(q) ? "vencido" : "aberto",
      itens: q.items.map((i) => `${i.qty}× ${i.description}`),
    }));
  }),
  tool(
    "resultado_financeiro",
    "Faturamento, custos, taxas, despesas e lucro de um período (padrão: o mês atual). Conta os pedidos entregues.",
    true,
    z.object({ de: date.optional(), ate: date.optional() }),
    obj({ de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD" } }),
    async (db, { de, ate }) => {
      const [from, to] = periodRange("month", todayIso());
      return { de: de ?? from, ate: ate ?? to, ...financeSummary(await ordersRepo.list(db), await costsRepo.list(db), de ?? from, ate ?? to, await wasteRunsRepo.list(db)) };
    },
  ),
  tool(
    "criar_cliente",
    "Cadastra um cliente novo (pessoa física). Confira antes com buscar_clientes se ele já existe.",
    false,
    NewCustomer,
    obj({ nome: { type: "string" }, telefone: { type: "string" }, email: { type: "string" }, instagram: { type: "string" }, observacoes: { type: "string" } }, ["nome"]),
    async (db, c) => ({ id: await customersRepo.insert(db, { ...EMPTY_CUSTOMER, name: c.nome, phone: c.telefone ?? "", email: c.email ?? "", instagram: c.instagram ?? "", notes: c.observacoes ?? "" }) }),
  ),
  tool(
    "criar_orcamento",
    "Cria um orçamento com a validade e as condições da empresa. A pessoa revisa, gera o PDF e envia pelo app.",
    false,
    NewQuote,
    obj(
      {
        cliente: { type: "string", description: "Nome do cliente." },
        cliente_id: { type: "integer", description: "Id de buscar_clientes, se ele já for cliente." },
        itens: { type: "array", minItems: 1, items: obj({ descricao: { type: "string" }, quantidade: { type: "number" }, preco_unitario: { type: "number", description: "Em reais." } }, ["descricao", "quantidade", "preco_unitario"]) },
        frete: { type: "number" },
        observacoes: { type: "string" },
        cor: { type: "string" },
        tamanho: { type: "string" },
      },
      ["cliente", "itens"],
    ),
    async (db, q) => {
      const company = await loadCompany(db);
      if (q.cliente_id && !(await customersRepo.list(db)).some((c) => c.id === q.cliente_id)) throw new Error("Cliente não encontrado; use buscar_clientes.");
      const now = new Date().toISOString();
      const id = await quotesRepo.create(db, {
        customerId: q.cliente_id ?? null, customerName: q.cliente, channel: CONSUMER, dueDate: null, paymentMethod: "", notes: q.observacoes ?? "", freight: q.frete ?? 0,
        items: q.itens.map((i) => ({ productId: null, description: i.descricao, qty: i.quantidade, unitPrice: i.preco_unitario, discountPct: 0, unitCost: 0, printMinutes: 0, custom: "" })),
        validUntil: addDays(todayIso(), company.quoteValidityDays), terms: company.quoteTerms, refColor: q.cor ?? "", refSize: q.tamanho ?? "",
      }, now);
      const saved = (await quotesRepo.list(db)).find((x) => x.id === id);
      return { numero: saved ? quoteNumber(saved, company.quotePrefix) : id, aviso: "Abra Orçamentos no app para revisar e gerar o PDF." };
    },
  ),
];

type Rpc = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
const ok = (id: unknown, result: unknown) => JSON.stringify({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string) => JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const text = (v: unknown, isError = false) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }], isError });

async function callTool(db: Db, params: unknown) {
  const p = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).safeParse(params);
  if (!p.success) return null;
  const t = TOOLS.find((x) => x.name === p.data.name);
  if (!t) return null;
  const args = t.input.safeParse(p.data.arguments ?? {});
  if (!args.success) return text(`Dados inválidos: ${args.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, true);
  try {
    return text(await t.run(db, args.data as never));
  } catch (e) {
    logError("conector de IA", e);
    return text(e instanceof z.ZodError ? `Dados inválidos: ${e.issues[0]?.message}` : e instanceof Error ? e.message : "Algo deu errado no app.", true);
  }
}

/** Uma mensagem JSON-RPC → o texto da resposta ("" para notificação, que não tem resposta). */
export async function handleMcp(db: Db, body: string): Promise<string> {
  let m: Rpc;
  try {
    m = JSON.parse(body) as Rpc;
  } catch {
    return fail(null, -32700, "JSON inválido.");
  }
  if (!m || typeof m !== "object" || Array.isArray(m) || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(null, -32600, "Pedido inválido.");
  if (m.id === undefined) return ""; // notificação (ex.: notifications/initialized)
  switch (m.method) {
    case "initialize": {
      const asked = (m.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked as string) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "upvision", version: "1" },
        instructions: "App de gestão de uma empresa de impressão 3D: pedidos, estoque, clientes, orçamentos e financeiro. Valores em reais. Antes de criar cliente ou orçamento, confirme com a pessoa.",
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema, annotations: { readOnlyHint: t.readOnly, destructiveHint: false } })) });
    case "tools/call": {
      const r = await callTool(db, m.params);
      return r ? ok(m.id, r) : fail(m.id, -32602, "Ferramenta desconhecida.");
    }
    default:
      return fail(m.id, -32601, "Método não existe.");
  }
}

/** Liga a janela ao servidor do conector: cada `mcp-request` do Rust vira uma resposta, uma de cada vez. */
export function installMcpBridge(): () => void {
  const respond = oneAtATime(async (p: { id: number; body: string }) => {
    const body = await handleMcp(await getDb(), p.body).catch((e) => (logError("conector de IA", e), fail(null, -32603, "Algo deu errado no app.")));
    await invoke("mcp_respond", { id: p.id, body });
  });
  const off = listen<{ id: number; body: string }>("mcp-request", ({ payload }) => void respond(payload));
  return () => void off.then((f) => f()).catch(() => {});
}
