// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { takePendingOpen } from "../ui/search";
import Dashboard from "./Dashboard";

const t = setupTauri();

async function order(o: { name: string; status: string; dueDate?: string | null; deliveredAt?: string | null; items: { productId: number | null; qty: number; unitPrice: number; unitCost?: number }[] }) {
  const r = await t.db.execute("INSERT INTO orders (customerName, channel, status, dueDate, deliveredAt, createdAt) VALUES (?, 'Loja', ?, ?, ?, '2026-01-01 10:00:00')", [o.name, o.status, o.dueDate ?? null, o.deliveredAt ?? null]);
  for (const [k, i] of o.items.entries()) {
    await t.db.execute("INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, unitCost) VALUES (?, ?, ?, 'Item', ?, ?, ?)", [r.lastInsertId, k, i.productId, i.qty, i.unitPrice, i.unitCost ?? 0]);
  }
  return Number(r.lastInsertId);
}

const tile = (label: string) => screen.getByText(label, { selector: ".stat-label" }).closest(".stat") as HTMLElement;
const text = (el: Element) => (el.textContent ?? "").replace(/\u00a0/g, " ");
const card = (title: RegExp) => screen.getByRole("heading", { name: title }).closest("section") as HTMLElement;

// Hoje = 15/06/2026: mês = junho, anterior = maio, janela de 30 dias = 16/05–15/06.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});
afterEach(() => vi.useRealTimers());

describe("Painel", () => {
  test("receita e lucro do mês vs. mês passado, abertos, atrasados, prazos e estoque", async () => {
    const comp = JSON.stringify({ filaments: [], materials: [], items: [] });
    await t.db.execute("INSERT INTO products (id, name, composition, stock) VALUES (1, 'Chaveiro', ?, 1), (2, 'Medalha', ?, 20), (3, 'Vaso', ?, 0)", [comp, comp, comp]);
    await order({ name: "Ana", status: "delivered", deliveredAt: "2026-06-10", items: [{ productId: 1, qty: 10, unitPrice: 20, unitCost: 5 }] });
    await order({ name: "Bia", status: "delivered", deliveredAt: "2026-06-12", items: [{ productId: 2, qty: 30, unitPrice: 1 }, { productId: 3, qty: 30, unitPrice: 1 }] });
    await order({ name: "Caio", status: "delivered", deliveredAt: "2026-05-05", items: [{ productId: null, qty: 1, unitPrice: 100 }] });
    const late = await order({ name: "Duda", status: "pending", dueDate: "2026-06-10", items: [{ productId: null, qty: 1, unitPrice: 40 }] });
    await order({ name: "Edu", status: "production", dueDate: "2026-06-20", items: [{ productId: null, qty: 2, unitPrice: 25 }] });
    await order({ name: "Fê", status: "done", dueDate: "2026-07-30", items: [{ productId: null, qty: 1, unitPrice: 10 }] });
    await order({ name: "Gil", status: "canceled", dueDate: "2026-06-11", items: [{ productId: null, qty: 1, unitPrice: 10 }] });
    await t.db.execute("INSERT INTO operational_costs (description, amount, frequency, startDate) VALUES ('Aluguel', 50, 'monthly', '2026-05-01')");
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, stockG, minG) VALUES ('PLA', 'Preto', 'X', 100, 100, 200), ('PETG', '', '', 100, 900, 200)");
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Argola', 'un', 1, 3, 5)");
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Dashboard go={go} />);

    await waitFor(() => expect(text(tile("Receita do mês"))).toContain("R$ 260,00"));
    expect(text(tile("Receita do mês"))).toContain("▲ 160% vs. período anterior"); // 260 vs 100
    expect(text(tile("Receita do mês"))).toContain("2 entregues");
    expect(text(tile("Lucro do mês"))).toContain("R$ 160,00"); // 260 − 50 − 50
    expect(text(tile("Lucro do mês"))).toContain("▲ 220%"); // vs 50
    expect(text(tile("Pedidos em aberto"))).toContain("31 em produção");
    expect(text(tile("Atrasados"))).toContain("1prazo já passou");
    expect(tile("Atrasados")).toHaveClass("bad");

    const prazos = card(/Prazos até 22\/06/);
    const items = within(prazos).getAllByRole("listitem").map(text);
    expect(items).toEqual([`#${late} Dudaatrasado · 10/06Pendente · R$ 40,00`, expect.stringMatching(/^#\d+ Edu20\/06Em produção · R\$ 50,00$/)]);
    await user.click(within(prazos).getByRole("button", { name: `#${late} Duda` }));
    expect(go).toHaveBeenCalledWith("orders");
    expect(takePendingOpen("orders")).toBe(late);

    const estoque = card(/Estoque acabando/);
    expect(within(estoque).getAllByRole("listitem").map(text)).toEqual(["PLA · Preto · X100 g", "Argola3 un"]);
    await user.click(within(estoque).getByRole("button", { name: "Repor filamentos" }));
    expect(go).toHaveBeenLastCalledWith("filaments");
    await user.click(within(estoque).getByRole("button", { name: "Repor materiais" }));
    expect(go).toHaveBeenLastCalledWith("materials");

    // ideal = ceil(vendidos / 30 × 14): 30 → 14, 10 → 5
    const rows = within(card(/Mais vendidos/)).getAllByRole("row").slice(1).map(text);
    expect(rows).toEqual(["Medalha3020 / 14  saudável", "Vaso300 / 14  crítico", "Chaveiro101 / 5  atenção"]);
  });

  test("sem dados: estados vazios, tudo em dia e sem base para comparar", async () => {
    renderWithApp(<Dashboard go={vi.fn()} />);
    expect(await screen.findByText("Nenhum pedido com prazo nos próximos 7 dias.")).toBeInTheDocument();
    expect(screen.getByText("Filamentos e materiais acima do mínimo.")).toBeInTheDocument();
    expect(screen.getByText(/Ainda sem vendas entregues/)).toBeInTheDocument();
    expect(text(tile("Atrasados"))).toContain("0tudo em dia");
    expect(text(tile("Receita do mês"))).toContain("sem base para comparar");
    expect(screen.queryByRole("button", { name: /Repor/ })).not.toBeInTheDocument();
  });

  test("lucro negativo no mês avisa prejuízo", async () => {
    await t.db.execute("INSERT INTO operational_costs (description, amount, frequency, startDate) VALUES ('Aluguel', 500, 'monthly', '2026-06-01')");
    renderWithApp(<Dashboard go={vi.fn()} />);
    await waitFor(() => expect(text(tile("Lucro do mês"))).toContain("-R$ 500,00"));
    expect(tile("Lucro do mês")).toHaveClass("bad");
    expect(text(tile("Lucro do mês"))).toContain("prejuízo até agora");
  });
});

describe("M15: erro do banco no Painel", () => {
  test("avisa que não deu para ler em vez de mostrar tudo zerado como se estivesse certo", async () => {
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("banco travado");
    };
    renderWithApp(<Dashboard go={() => {}} />);
    expect(await screen.findByText(/Não foi possível ler os dados: banco travado/)).toBeInTheDocument();
  });
});
