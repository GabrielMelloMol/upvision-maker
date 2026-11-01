// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { setupTauri } from "../test/harness";
import { customersRepo } from "../db/customersRepo";
import { quotesRepo } from "../db/quotesRepo";
import { handleMcp } from "./server";

const t = setupTauri();
let n = 0;
const rpc = async (method: string, params?: unknown) => JSON.parse(await handleMcp(t.db, JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params })));
const call = async (name: string, args: unknown = {}) => (await rpc("tools/call", { name, arguments: args })).result as { content: { text: string }[]; isError: boolean };

describe("conector de IA (MCP, #304)", () => {
  test("initialize devolve a versão pedida (se conhecida) e as ferramentas", async () => {
    expect((await rpc("initialize", { protocolVersion: "2025-03-26" })).result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "upvision" } });
    expect((await rpc("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe("2025-06-18");
    const tools = (await rpc("tools/list")).result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((x) => x.name)).toEqual(["pedidos_e_estoque", "impressoras_agora", "buscar_clientes", "listar_orcamentos", "resultado_financeiro", "criar_cliente", "criar_orcamento"]);
    expect(tools.filter((x) => !x.annotations.readOnlyHint).map((x) => x.name)).toEqual(["criar_cliente", "criar_orcamento"]);
  });

  test("notificação não tem resposta; lixo e método desconhecido viram erro JSON-RPC", async () => {
    expect(await handleMcp(t.db, JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).toBe("");
    expect(JSON.parse(await handleMcp(t.db, "{")).error.code).toBe(-32700);
    expect(JSON.parse(await handleMcp(t.db, "[]")).error.code).toBe(-32600);
    expect((await rpc("apagar_tudo")).error.code).toBe(-32601);
    expect((await rpc("tools/call", { name: "apagar_tudo" })).error.code).toBe(-32602);
  });

  test("cria cliente e orçamento com a validade e as condições da empresa; dados ruins não gravam", async () => {
    const c = await call("criar_cliente", { nome: "Val Clínica", telefone: "21 99999-0000" });
    expect(c.isError).toBe(false);
    const { id } = JSON.parse(c.content[0].text) as { id: number };
    expect((await customersRepo.list(t.db))[0]).toMatchObject({ id, name: "Val Clínica", phone: "21 99999-0000" });
    expect(JSON.parse((await call("buscar_clientes", { busca: "val" })).content[0].text)).toHaveLength(1);

    const q = await call("criar_orcamento", { cliente: "Val Clínica", cliente_id: id, itens: [{ descricao: "Perfil de rosto", quantidade: 1, preco_unitario: 60 }], tamanho: "25 cm" });
    expect(q.isError).toBe(false);
    expect(JSON.parse(q.content[0].text).numero).toMatch(/^ORC-\d{4}-001$/);
    const [saved] = await quotesRepo.list(t.db);
    expect(saved).toMatchObject({ customerId: id, refSize: "25 cm", items: [{ description: "Perfil de rosto", unitPrice: 60 }] });
    expect(saved.terms).toContain("50%");

    expect((await call("criar_orcamento", { cliente: "X", itens: [] })).isError).toBe(true);
    expect((await call("criar_orcamento", { cliente: "X", cliente_id: 999, itens: [{ descricao: "a", quantidade: 1, preco_unitario: 1 }] })).content[0].text).toContain("Cliente não encontrado");
    expect((await call("criar_cliente", { nome: "Y", email: "não é email" })).isError).toBe(true);
    expect(await quotesRepo.list(t.db)).toHaveLength(1);
    expect(JSON.parse((await call("listar_orcamentos")).content[0].text)[0]).toMatchObject({ cliente: "Val Clínica", total: 60, situacao: "aberto" });
  });

  test("consultas de pedidos e financeiro respondem mesmo sem dados", async () => {
    expect(JSON.parse((await call("pedidos_e_estoque")).content[0].text)).toEqual({ orders: [], filaments: [] });
    const f = JSON.parse((await call("resultado_financeiro", { de: "2026-01-01", ate: "2026-12-31" })).content[0].text);
    expect(f).toMatchObject({ de: "2026-01-01", ate: "2026-12-31", revenue: 0, profit: 0 });
    expect((await call("resultado_financeiro", { de: "ontem" })).isError).toBe(true);
  });
});
