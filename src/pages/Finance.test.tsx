// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Finance from "./Finance";

const t = setupTauri();

type Item = { productId: number | null; description: string; qty: number; unitPrice: number; discountPct?: number; unitCost: number; printMinutes?: number };
async function order(o: { channel: string; status: string; deliveredAt: string | null; freight?: number; items: Item[] }) {
  const r = await t.db.execute("INSERT INTO orders (customerName, channel, status, deliveredAt, freight, createdAt) VALUES ('Ana', ?, ?, ?, ?, '2026-01-01 10:00:00')", [o.channel, o.status, o.deliveredAt, o.freight ?? 0]);
  for (const [k, i] of o.items.entries()) {
    await t.db.execute("INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, discountPct, unitCost, printMinutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [r.lastInsertId, k, i.productId, i.description, i.qty, i.unitPrice, i.discountPct ?? 0, i.unitCost, i.printMinutes ?? 0]);
  }
}

/**
 * Hoje = 15/06/2026. "3 meses" = 01/04–30/06 (anterior: 01/01–31/03/2026, meses de calendário).
 * Atual: pedido de jun (Shopee, 10× Chaveiro a 20 + frete 15 = 215, custo 50, 5 h) e de mai (Instagram, 2× Medalha a 50 −10% = 90, custo 20, 2 h).
 * Anterior: pedido de fev (Shopee, 5× Chaveiro = 100, custo 25). Custo fixo de 100/mês desde jan, ligado à impressora 1.
 */
async function seed() {
  await t.db.execute("INSERT INTO printers (id, name, watts) VALUES (1, 'Bambu A1', 95)");
  const comp = JSON.stringify({ filaments: [], materials: [], items: [] });
  await t.db.execute("INSERT INTO products (id, name, composition, printerId) VALUES (1, 'Chaveiro', ?, 1), (2, 'Medalha', ?, NULL)", [comp, comp]);
  await order({ channel: "Shopee", status: "delivered", deliveredAt: "2026-06-10", freight: 15, items: [{ productId: 1, description: "Chaveiro", qty: 10, unitPrice: 20, unitCost: 5, printMinutes: 30 }] });
  await order({ channel: "Instagram", status: "delivered", deliveredAt: "2026-05-05", items: [{ productId: 2, description: "Medalha", qty: 2, unitPrice: 50, discountPct: 10, unitCost: 10, printMinutes: 60 }] });
  await order({ channel: "Shopee", status: "delivered", deliveredAt: "2026-02-10", items: [{ productId: 1, description: "Chaveiro", qty: 5, unitPrice: 20, unitCost: 5 }] });
  await order({ channel: "Feira", status: "canceled", deliveredAt: null, items: [{ productId: 1, description: "Chaveiro", qty: 99, unitPrice: 20, unitCost: 5 }] });
  await order({ channel: "Feira", status: "pending", deliveredAt: null, items: [{ productId: 1, description: "Chaveiro", qty: 99, unitPrice: 20, unitCost: 5 }] });
  await t.db.execute("INSERT INTO operational_costs (description, amount, frequency, startDate, printerId) VALUES ('Parcela', 100, 'monthly', '2026-01-01', 1)");
}

const tile = (label: string) => screen.getByText(label, { selector: ".stat-label" }).closest(".stat") as HTMLElement;
const brl = (s: string) => s.replace(/\u00a0/g, " ");
const text = (el: Element) => brl(el.textContent ?? "");
const select = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});
afterEach(() => vi.useRealTimers());

describe("Financeiro", () => {
  test("3 meses: totais, variação com seta e prejuízo; cancelados e pendentes não contam", async () => {
    await seed();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    expect(screen.getByRole("button", { name: "3 meses" })).toHaveAttribute("aria-pressed", "true");
    expect(text(tile("Receita"))).toContain("▲ 205% vs. período anterior");
    expect(text(tile("Receita"))).toContain("2 pedidos entregues");
    expect(text(tile("Custo das peças"))).toContain("R$ 70,00");
    expect(tile("Custo das peças").querySelector(".stat-delta")).toHaveClass("bad"); // custo subir é ruim
    expect(text(tile("Custos operacionais"))).toContain("R$ 300,00");
    expect(tile("Custos operacionais").querySelector(".stat-delta")).toBeNull(); // 300 vs 300
    expect(text(tile("Lucro"))).toContain("-R$ 65,00");
    expect(tile("Lucro")).toHaveClass("bad");
    expect(text(tile("Lucro"))).toContain("prejuízo no período");
    // prejuízo: em vez de % sobre base negativa (que confundia, polimento), a diferença em R$ e se melhorou
    expect(text(tile("Lucro"))).toMatch(/▲ R\$\s160,00 melhor vs\. período anterior/); // -65 vs -225
    expect(tile("Lucro").querySelector(".stat-delta")).toHaveClass("good");
    expect(text(tile("R$ por hora de impressão"))).toContain("R$ 43,57");
    expect(text(tile("R$ por hora de impressão"))).toContain("7 h de máquina");
    expect(text(tile("Ticket médio"))).toContain("R$ 152,50");
  });

  test("breakdown por canal, produto e impressora (sem impressora aparece separado)", async () => {
    await seed();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    const card = (title: string) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;
    const items = (title: string) => within(card(title)).getAllByRole("listitem").map((li) => brl(li.getAttribute("title") ?? ""));
    // canal soma só os itens (o frete fica fora do breakdown)
    expect(items("Por canal")).toEqual(["Shopee: R$ 200,00 · lucro bruto R$ 150,00", "Instagram: R$ 90,00 · lucro bruto R$ 70,00"]);
    expect(items("Mais vendidos")).toEqual(["Chaveiro: R$ 200,00 · 10 un", "Medalha: R$ 90,00 · 2 un"]);
    expect(items("Por impressora")).toEqual(["Bambu A1: R$ 200,00 · lucro bruto R$ 150,00", "Sem impressora: R$ 90,00 · lucro bruto R$ 70,00"]);
    // barra maior = 100%
    expect((within(card("Por canal")).getAllByRole("listitem")[0].querySelector(".hbars-bar") as HTMLElement).style.width).toBe("100%");
  });

  test("troca de período: Este mês e 12 meses", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));

    await user.click(screen.getByRole("button", { name: "Este mês" }));
    expect(text(tile("Receita"))).toContain("R$ 215,00");
    expect(text(tile("Receita"))).toContain("▲ 139%"); // vs maio inteiro (90)
    expect(text(tile("Custos operacionais"))).toContain("R$ 100,00");
    // maio inteiro (com o dia 1º, quando cai a parcela) é a base: 100 vs 100, sem variação
    expect(text(tile("Custos operacionais"))).not.toContain("sem base para comparar");
    expect(text(tile("Lucro"))).toContain("R$ 65,00");
    expect(tile("Lucro")).not.toHaveClass("bad");

    await user.click(screen.getByRole("button", { name: "12 meses" }));
    expect(text(tile("Receita"))).toContain("R$ 405,00");
    expect(text(tile("Custos operacionais"))).toContain("R$ 600,00"); // jan–jun
    expect(text(tile("Custo das peças"))).toContain("sem base para comparar");
    expect(screen.getByRole("img", { name: "Receita e custos por mês, 12 meses" })).toBeInTheDocument();
  });

  test("período personalizado usa as datas digitadas", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    await user.click(screen.getByRole("button", { name: "Personalizado" }));
    expect(screen.getByLabelText("De")).toHaveValue("2026-06-01");
    expect(screen.getByLabelText("Até")).toHaveValue("2026-06-30");
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("Até"), { target: { value: "2026-02-28" } });
    expect(text(tile("Receita"))).toContain("R$ 100,00");
    expect(text(tile("Custo das peças"))).toContain("R$ 25,00");
    expect(text(tile("Custos operacionais"))).toContain("R$ 100,00");
    expect(text(tile("R$ por hora de impressão"))).toContain("—"); // sem minutos de impressão
  });

  test("filtros de canal, produto e impressora", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    expect([...select("Canal").options].map((o) => o.text)).toEqual(["Todos", "Feira", "Shopee", "Instagram"]);

    await user.selectOptions(select("Canal"), "Shopee");
    expect(text(tile("Receita"))).toContain("R$ 215,00"); // com frete
    expect(text(tile("Custos operacionais"))).toContain("R$ 300,00");
    await user.selectOptions(select("Canal"), "");

    await user.selectOptions(select("Produto"), "Medalha");
    expect(text(tile("Receita"))).toContain("R$ 90,00");
    expect(text(tile("Custos operacionais"))).toContain("R$ 0,00");
    expect(text(tile("Custos operacionais"))).toContain("não se aplicam a um produto");
    await user.selectOptions(select("Produto"), "");

    await user.selectOptions(select("Impressora"), "Bambu A1");
    expect(text(tile("Receita"))).toContain("R$ 200,00"); // frete não é atribuível à impressora
    expect(text(tile("Custos operacionais"))).toContain("R$ 300,00");
  });

  test("gráfico mensal: legenda, tabela e tooltip ao passar o mouse", async () => {
    await seed();
    const user = userEvent.setup();
    const { container } = renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    const fig = screen.getByRole("img", { name: "Receita e custos por mês, 3 meses" }).closest("figure") as HTMLElement;
    expect(within(fig).getByText("Receita")).toBeInTheDocument();
    expect(within(fig).getByText("Custos (peças + despesas)")).toBeInTheDocument();
    expect(within(fig).getAllByText(/^(abr|mai|jun)\/26$/).map((e) => e.textContent)).toEqual(["abr/26", "mai/26", "jun/26"]);

    await user.hover(fig.querySelectorAll(".viz-hit")[2]);
    const tip = container.querySelector(".viz-tip") as HTMLElement;
    expect(text(tip)).toBe("jun/26 Receita R$ 215,00 Custos R$ 150,00Lucro R$ 65,00");
    await user.unhover(fig.querySelectorAll(".viz-hit")[2]);
    expect(fig.querySelector(".viz-tip")).toBeNull();

    await user.click(within(fig).getByRole("button", { name: "Ver tabela" }));
    const rows = within(fig).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map(text));
    expect(rows).toEqual([
      ["abr/26", "R$ 0,00", "R$ 100,00", "-R$ 100,00"],
      ["mai/26", "R$ 90,00", "R$ 120,00", "-R$ 30,00"],
      ["jun/26", "R$ 215,00", "R$ 150,00", "R$ 65,00"],
    ]);
    await user.click(within(fig).getByRole("button", { name: "Ver gráfico" }));
    expect(within(fig).getByRole("img")).toBeInTheDocument();
  });

  test("gráfico de lucro: positivo e negativo com cores diferentes e tooltip", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    const fig = screen.getByRole("figure", { name: "Lucro por mês" });
    expect(fig.querySelectorAll("path.viz-bad")).toHaveLength(2); // abr e mai
    expect(fig.querySelectorAll("path.viz-s1")).toHaveLength(1); // jun
    await user.hover(fig.querySelectorAll(".viz-hit")[1]);
    expect(text(fig.querySelector(".viz-tip")!)).toBe("mai/26Receita R$ 90,00Custos R$ 120,00Lucro -R$ 30,00");
    await user.unhover(fig.querySelectorAll(".viz-hit")[1]);
    expect(fig.querySelector(".viz-tip")).toBeNull();
  });

  test("exporta planilha CSV com itens e resumo", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    await user.click(screen.getByRole("button", { name: /Exportar planilha/ }));
    const path = "/saida/financeiro-2026-04-01-a-2026-06-30.csv";
    expect(await screen.findByText(`Planilha salva em ${path}`)).toBeInTheDocument();
    const csv = new TextDecoder().decode(t.files.get(path));
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Pedido;Entregue em;Cliente;Canal;Item;Qtd;Preço un.;Desconto %;Total do item;Custo un.;Lucro bruto do item;Frete do pedido;Total do pedido");
    expect(lines).toContain("1;2026-06-10;Ana;Shopee;Chaveiro;10;20;0;200;5;150;15;215");
    expect(lines).toContain("2;2026-05-05;Ana;Instagram;Medalha;2;50;10;90;10;70;0;90");
    expect(lines.some((l) => l.includes("Feira"))).toBe(false);
    expect(lines).toContain("Resumo;2026-04-01 a 2026-06-30");
    expect(lines).toContain("Lucro;-65");
    expect(lines).toContain("R$ por hora de impressão;43,57");
  });

  test("exportar: cancelar não avisa; erro ao gravar vira toast de erro", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<Finance go={() => {}} />);
    await waitFor(() => expect(text(tile("Receita"))).toContain("R$ 305,00"));
    t.savePath = () => null;
    await user.click(screen.getByRole("button", { name: /Exportar planilha/ }));
    expect(t.calls).toContain("plugin:dialog|save");
    expect(t.calls).not.toContain("plugin:fs|write_file");
    expect(screen.queryByText(/Planilha salva/)).not.toBeInTheDocument();

    t.savePath = (s) => `/saida/${s}`;
    t.handlers["plugin:fs|write_file"] = () => {
      throw new Error("disco cheio");
    };
    await user.click(screen.getByRole("button", { name: /Exportar planilha/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("disco cheio");
  });

  test("sem vendas no período (só um pedido entregue bem antigo): zeros, sem base para comparar e breakdowns vazios", async () => {
    await order({ channel: "Loja", status: "delivered", deliveredAt: "2020-01-10", items: [{ productId: null, description: "Velho", qty: 1, unitPrice: 10, unitCost: 5 }] });
    renderWithApp(<Finance go={() => {}} />);
    await screen.findByText("Receita e custos por mês");
    expect(text(tile("Receita"))).toContain("R$ 0,00");
    expect(text(tile("Receita"))).toContain("sem base para comparar");
    expect(text(tile("Ticket médio"))).toContain("—");
    expect(screen.getAllByText("Sem vendas entregues no período.")).toHaveLength(3);
  });
});

describe("UX M11: Financeiro sem nenhum pedido entregue", () => {
  test("explica quando os números aparecem, leva aos Pedidos e não oferece exportar planilha vazia", async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Finance go={go} />);
    expect(await screen.findByText(/Os números aparecem quando o primeiro pedido for marcado como entregue/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exportar planilha/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Receita e custos por mês")).not.toBeInTheDocument(); // sem gráfico vazio com eixo de 0 a 1
    await user.click(screen.getByRole("button", { name: "Ir para Pedidos" }));
    expect(go).toHaveBeenCalledWith("orders");
  });

  test("com um pedido entregue, mostra os números e o botão de exportar", async () => {
    await t.db.execute("INSERT INTO orders (customerName, channel, status, deliveredAt, createdAt) VALUES ('Ana', 'Loja', 'delivered', '2026-06-10', '2026-06-01 10:00:00')");
    renderWithApp(<Finance go={() => {}} />);
    expect(await screen.findByRole("button", { name: /Exportar planilha/ })).toBeInTheDocument();
    expect(screen.queryByText(/Os números aparecem quando/)).not.toBeInTheDocument();
  });
});
