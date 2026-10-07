// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { todayIso } from "../domain/orders";
import { renderWithApp, setupTauri, type TauriState } from "../test/harness";
import { setPendingOpen } from "../ui/search";
import Orders from "./Orders";

const t = setupTauri();

type Mv = { kind: "filament" | "material" | "product"; id: number; delta: number };
type Change = { orderId: number; expectApplied: boolean; setApplied: boolean; status: string; note: string; appliedPlan: string | null; deliveredAt: string | null; delete?: boolean };
/** Mesmo contrato do comando Rust apply_stock (src-tauri/src/stock.rs e o mock do E2E), sobre o SQLite do teste. */
function installApplyStock(s: TauriState) {
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  s.handlers["apply_stock"] = (a) => {
    const movements = a.movements as Mv[];
    const order = a.order as Change | null;
    s.raw.exec("BEGIN");
    try {
      if (order) {
        const row = s.raw.prepare("SELECT stockApplied FROM orders WHERE id = ?").get(order.orderId) as { stockApplied: number } | undefined;
        if (!row) throw "Pedido não encontrado.";
        if ((row.stockApplied !== 0) !== order.expectApplied) throw "O estoque deste pedido já foi atualizado por outra ação.";
      }
      for (const mv of movements) {
        const [tb, c] = col[mv.kind];
        if (s.raw.prepare(`UPDATE ${tb} SET ${c} = ${c} + ? WHERE id = ?`).run(mv.delta, mv.id).changes === 0) throw `Item de estoque não encontrado (${tb} #${mv.id}).`;
      }
      if (order?.delete) for (const tb of ["order_items WHERE orderId", "order_history WHERE orderId", "orders WHERE id"]) s.raw.prepare(`DELETE FROM ${tb} = ?`).run(order.orderId);
      else if (order) {
        s.raw.prepare("UPDATE orders SET stockApplied = ?, status = ?, appliedPlan = ?, deliveredAt = ? WHERE id = ?").run(order.setApplied ? 1 : 0, order.status, order.appliedPlan, order.deliveredAt, order.orderId);
        s.raw.prepare("INSERT INTO order_history (orderId, status, note, at) VALUES (?, ?, ?, '2026-09-28 10:00:00')").run(order.orderId, order.status, order.note);
      }
      s.raw.exec("COMMIT");
    } catch (e) {
      s.raw.exec("ROLLBACK");
      throw e;
    }
    return null;
  };
}

const seed = () =>
  t.raw.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":10}],"materials":[],"items":[]}', 1, 1, 15);
    INSERT INTO customers (kind, name, discountPct, active) VALUES ('pf', 'Ana', 10, 1), ('pf', 'Inativa', 0, 0);`);
const filamentStock = () => (t.raw.prepare("SELECT stockG FROM filaments").get() as { stockG: number }).stockG;
const productStock = () => (t.raw.prepare("SELECT stock FROM products").get() as { stock: number }).stock;
const orderRow = () => t.raw.prepare("SELECT status, stockApplied, deliveredAt FROM orders").get();

/** Pedido já existente (Chaveiro × qty, ou item avulso). */
const insertOrder = (o: { name?: string; status?: string; due?: string | null; qty?: number; productId?: number | null; freight?: number }) => {
  const r = t.raw
    .prepare("INSERT INTO orders (customerName, channel, status, dueDate, freight, paymentMethod, createdAt) VALUES (?, 'Consumidor final', ?, ?, ?, 'Pix', '2026-09-01 10:00:00')")
    .run(o.name ?? "Bia", o.status ?? "pending", o.due ?? null, o.freight ?? 0);
  const id = Number(r.lastInsertRowid);
  t.raw.prepare("INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice) VALUES (?, 0, ?, 'Chaveiro', ?, 15)").run(id, o.productId === undefined ? 1 : o.productId, o.qty ?? 2);
  t.raw.prepare("INSERT INTO order_history (orderId, status, note, at) VALUES (?, 'pending', 'Pedido criado', '2026-09-01 10:00:00')").run(id);
  return id;
};

beforeEach(() => installApplyStock(t));

describe("Pedidos: novo pedido", () => {
  test("preço do produto e desconto do cliente; total com frete; grava custo e minutos da foto do produto", async () => {
    seed();
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click((await screen.findAllByRole("button", { name: /Novo pedido|Criar o primeiro pedido/ }))[0]);
    const sheet = await screen.findByRole("dialog", { name: "Novo pedido" });
    const customers = within(sheet).getByLabelText("Cliente cadastrado");
    expect(within(customers).queryByRole("option", { name: "Inativa" })).not.toBeInTheDocument();
    await user.selectOptions(customers, "Ana");
    expect(within(sheet).getByLabelText(/^Nome do cliente/)).toHaveValue("Ana");
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    await user.selectOptions(within(sheet).getByLabelText("Produto"), "Chaveiro");
    expect(within(sheet).getByLabelText("Descrição")).toHaveValue("Chaveiro");
    expect(within(sheet).getByLabelText("Preço un.")).toHaveValue("15,00");
    expect(within(sheet).getByLabelText("Desc. %")).toHaveValue("10");
    await user.clear(within(sheet).getByLabelText("Qtd"));
    await user.type(within(sheet).getByLabelText("Qtd"), "3");
    await user.clear(within(sheet).getByLabelText("Frete cobrado"));
    await user.type(within(sheet).getByLabelText("Frete cobrado"), "12");
    const totals = within(sheet).getByRole("table");
    expect(within(totals).getByRole("row", { name: /Subtotal/ })).toHaveTextContent("R$ 45,00");
    expect(within(totals).getByRole("row", { name: /Descontos/ })).toHaveTextContent("R$ 4,50");
    expect(within(totals).getByRole("row", { name: /Frete/ })).toHaveTextContent("R$ 12,00");
    expect(within(totals).getByRole("row", { name: /Total/ })).toHaveTextContent("R$ 52,50");
    await user.type(within(sheet).getByLabelText("Prazo de entrega"), "2026-10-10");
    await user.selectOptions(within(sheet).getByLabelText("Pagamento"), "Dinheiro");
    await user.type(within(sheet).getByLabelText(/^Observações/), "azul");
    await user.click(within(sheet).getByRole("button", { name: "Criar pedido" }));

    expect(await screen.findByText("Pedido #1 criado.")).toBeInTheDocument();
    expect(t.raw.prepare("SELECT customerId, customerName, dueDate, paymentMethod, freight, notes, status FROM orders").get()).toEqual({
      customerId: 1,
      customerName: "Ana",
      dueDate: "2026-10-10",
      paymentMethod: "Dinheiro",
      freight: 12,
      notes: "azul",
      status: "pending",
    });
    const item = t.raw.prepare("SELECT productId, qty, unitPrice, discountPct, unitCost FROM order_items").get() as Record<string, number>;
    expect(item).toMatchObject({ productId: 1, qty: 3, unitPrice: 15, discountPct: 10 });
    expect(item.unitCost).toBeGreaterThan(0);
    expect(t.raw.prepare("SELECT note FROM order_history").all()).toEqual([{ note: "Pedido criado" }]);
    const card = await screen.findByRole("button", { name: "Abrir pedido #1 de Ana" });
    expect(card).toHaveTextContent("3× Chaveiro");
    expect(card).toHaveTextContent("10/10");
    expect(card).toHaveTextContent("R$ 52,50");
  });

  test("canal troca o preço sugerido, mas não o digitado à mão; item avulso e remover linha", async () => {
    seed();
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click((await screen.findAllByRole("button", { name: /Novo pedido/ }))[0]);
    const sheet = await screen.findByRole("dialog", { name: "Novo pedido" });
    await user.type(within(sheet).getByLabelText(/^Nome do cliente/), "Caio");
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    const [p1, p2] = within(sheet).getAllByLabelText("Produto");
    await user.selectOptions(p1, "Chaveiro");
    await user.selectOptions(p2, "Chaveiro");
    const [price1, price2] = within(sheet).getAllByLabelText("Preço un.");
    await user.clear(price2);
    await user.type(price2, "20");
    await user.selectOptions(within(sheet).getByLabelText("Canal"), "Revenda");
    expect(price1).not.toHaveValue("15,00"); // acompanhou o canal (preço de revenda calculado)
    expect(price2).toHaveValue("20,00"); // formatado ao sair do campo
    const resale = (price1 as HTMLInputElement).value;
    await user.selectOptions(within(sheet).getByLabelText("Canal"), "Shopee");
    expect(price1).not.toHaveValue(resale);

    await user.click(within(sheet).getAllByRole("button", { name: "Remover" })[0]);
    expect(within(sheet).getAllByLabelText("Produto")).toHaveLength(1);
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    const desc = within(sheet).getAllByLabelText("Descrição")[1];
    await user.type(desc, "Embrulho");
    await user.type(within(sheet).getAllByLabelText("Preço un.")[1], "abc");
    expect(within(sheet).queryByRole("row", { name: /Total/ })).not.toBeInTheDocument(); // preço inválido esconde os totais
    expect(within(sheet).getAllByText("—").length).toBeGreaterThan(0);
    await user.clear(within(sheet).getAllByLabelText("Preço un.")[1]);
    await user.type(within(sheet).getAllByLabelText("Preço un.")[1], "2,5");
    await user.click(within(sheet).getByRole("button", { name: "Criar pedido" }));
    await screen.findByText("Pedido #1 criado.");
    expect(t.raw.prepare("SELECT channel FROM orders").get()).toEqual({ channel: "Shopee" });
    expect(t.raw.prepare("SELECT productId, description, unitPrice, unitCost FROM order_items ORDER BY position").all()).toEqual([
      { productId: 1, description: "Chaveiro", unitPrice: 20, unitCost: expect.any(Number) },
      { productId: null, description: "Embrulho", unitPrice: 2.5, unitCost: 0 },
    ]);
  });

  test("validação: cliente obrigatório, pelo menos um item e item sem descrição", async () => {
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click((await screen.findAllByRole("button", { name: /Novo pedido/ }))[0]);
    const sheet = await screen.findByRole("dialog", { name: "Novo pedido" });
    await user.click(within(sheet).getByRole("button", { name: "Criar pedido" }));
    expect(await within(sheet).findByText("Informe o cliente.")).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^Nome do cliente/)).toHaveAttribute("aria-invalid", "true");
    expect(within(sheet).getByText("Adicione pelo menos um item.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    await user.type(within(sheet).getByLabelText("Preço un."), "5");
    await user.click(within(sheet).getByRole("button", { name: "Criar pedido" }));
    // item sem descrição: o erro diz qual item e qual campo
    const items = within(sheet).getByRole("group", { name: "Itens" });
    expect(await within(items).findByText("Item 1 — descrição: Obrigatório.")).toBeInTheDocument();
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 0 });
  });

  test("erro do banco ao criar vira aviso", async () => {
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click((await screen.findAllByRole("button", { name: /Novo pedido/ }))[0]);
    const sheet = await screen.findByRole("dialog", { name: "Novo pedido" });
    await user.type(within(sheet).getByLabelText(/^Nome do cliente/), "Caio");
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    await user.type(within(sheet).getByLabelText("Descrição"), "Peça");
    await user.type(within(sheet).getByLabelText("Preço un."), "5");
    t.handlers["sql_batch"] = () => {
      throw new Error("disco cheio");
    };
    await user.click(within(sheet).getByRole("button", { name: "Criar pedido" }));
    expect(await screen.findAllByText("disco cheio")).not.toHaveLength(0);
  });
});

describe("M15: erro do banco não aparece como 'nada cadastrado'", () => {
  test("banco que falha ao ler mostra 'Não foi possível ler' com Tentar de novo, e não o estado vazio", async () => {
    seed();
    insertOrder({ qty: 2 });
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("banco travado");
    };
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    expect(await screen.findByText(/Não foi possível ler os dados: banco travado/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum pedido ainda")).not.toBeInTheDocument();
    delete t.handlers["plugin:sql|select"];
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("button", { name: /Abrir pedido #1/ })).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível ler os dados/)).not.toBeInTheDocument();
  });
});

describe("Pedidos: status e estoque", () => {
  test("quadro: iniciar produção baixa estoque; concluir e entregar não baixam de novo; cancelar devolve; reabrir", async () => {
    seed();
    insertOrder({ qty: 3 });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    const pending = await screen.findByRole("region", { name: "Pendente" });
    await user.click(within(pending).getByRole("button", { name: "Iniciar produção →" }));
    expect(await screen.findByText("Pedido #1: Em produção.")).toBeInTheDocument();
    expect(productStock()).toBe(0); // 1 pronto usado
    expect(filamentStock()).toBe(980); // 2 fabricados × 10 g
    expect(orderRow()).toEqual({ status: "production", stockApplied: 1, deliveredAt: null });

    const production = screen.getByRole("region", { name: "Em produção" });
    await user.click(await within(production).findByRole("button", { name: "Concluir →" }));
    const done = screen.getByRole("region", { name: "Concluído" });
    await user.click(await within(done).findByRole("button", { name: "Marcar entregue →" }));
    await waitFor(() => expect(orderRow()).toEqual({ status: "delivered", stockApplied: 1, deliveredAt: todayIso() }));
    expect(filamentStock()).toBe(980);

    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    const detail = await screen.findByRole("dialog", { name: /Pedido #1/ });
    expect(detail).toHaveTextContent("Estoque baixado");
    expect(detail).toHaveTextContent(`Entregue em ${todayIso().split("-").reverse().join("/")}`);
    expect(await within(detail).findByText("Em produção · Estoque baixado")).toBeInTheDocument();
    await user.click(within(within(detail).getByRole("group", { name: "Mudar status" })).getByRole("button", { name: "Cancelado" }));
    expect(await screen.findByText("Pedido #1: Cancelado.")).toBeInTheDocument();
    expect(productStock()).toBe(1);
    expect(filamentStock()).toBe(1000);
    expect(orderRow()).toEqual({ status: "canceled", stockApplied: 0, deliveredAt: null });
    expect(await screen.findByText(/Pedidos cancelados ficam na Lista/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lista" }));
    await user.click(await screen.findByRole("button", { name: "#1" }));
    const again = await screen.findByRole("dialog", { name: /Pedido #1/ });
    const group = within(again).getByRole("group", { name: "Mudar status" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Reabrir"]);
    await user.click(within(group).getByRole("button", { name: "Reabrir" }));
    await waitFor(() => expect(orderRow()).toMatchObject({ status: "pending", stockApplied: 0 }));
  });

  test("cancelar pede confirmação: 'Voltar' não muda nada", async () => {
    seed();
    insertOrder({ status: "pending" });
    t.askAnswer = false;
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    const detail = await screen.findByRole("dialog", { name: /Pedido #1/ });
    await user.click(within(within(detail).getByRole("group", { name: "Mudar status" })).getByRole("button", { name: "Cancelado" }));
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|message"));
    expect(t.calls).not.toContain("apply_stock");
    expect(orderRow()).toMatchObject({ status: "pending" });
  });

  test("arrastar o cartão para outra coluna muda o status; soltar na mesma não faz nada", async () => {
    seed();
    insertOrder({});
    renderWithApp(<Orders />);
    const card = (await screen.findByRole("button", { name: /Abrir pedido #1/ })).closest("article")!;
    fireEvent.dragStart(card);
    fireEvent.dragOver(screen.getByRole("region", { name: "Pendente" }));
    fireEvent.drop(screen.getByRole("region", { name: "Pendente" }));
    expect(t.calls).not.toContain("apply_stock");
    fireEvent.drop(screen.getByRole("region", { name: "Concluído" }));
    expect(await screen.findByText("Pedido #1: Concluído.")).toBeInTheDocument();
    expect(orderRow()).toMatchObject({ status: "done", stockApplied: 1 });
    fireEvent.dragEnd(card);
  });

  test("conflito de estoque (outra ação já baixou) vira aviso e recarrega", async () => {
    seed();
    insertOrder({});
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await screen.findByRole("button", { name: /Abrir pedido #1/ });
    t.raw.exec("UPDATE orders SET stockApplied = 1"); // mudou por fora, a tela está desatualizada
    await user.click(screen.getByRole("button", { name: "Iniciar produção →" }));
    expect(await screen.findByText("O estoque deste pedido já foi atualizado por outra ação.")).toBeInTheDocument();
    expect(filamentStock()).toBe(1000);
  });

  test("erro ao mudar status no detalhe vira aviso e mantém o detalhe aberto", async () => {
    seed();
    insertOrder({});
    t.handlers["apply_stock"] = () => {
      throw "Item de estoque não encontrado (products #1).";
    };
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    const detail = await screen.findByRole("dialog", { name: /Pedido #1/ });
    await user.click(within(within(detail).getByRole("group", { name: "Mudar status" })).getByRole("button", { name: "Em produção" }));
    expect(await screen.findByText("Item de estoque não encontrado (products #1).")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /Pedido #1/ })).toBeInTheDocument();
  });

  test("excluir pedido com estoque baixado devolve tudo e apaga itens e histórico", async () => {
    seed();
    insertOrder({ qty: 3 });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: "Iniciar produção →" }));
    await waitFor(() => expect(filamentStock()).toBe(980));
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    const detail = await screen.findByRole("dialog", { name: /Pedido #1/ });
    t.askAnswer = false;
    await user.click(within(detail).getByRole("button", { name: "Excluir pedido" }));
    await waitFor(() => expect(t.calls.filter((c) => c === "plugin:dialog|message")).toHaveLength(1));
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 1 });
    t.askAnswer = true;
    await user.click(within(detail).getByRole("button", { name: "Excluir pedido" }));
    expect(await screen.findByText("Pedido #1 excluído.")).toBeInTheDocument();
    expect(filamentStock()).toBe(1000);
    expect(productStock()).toBe(1);
    for (const tb of ["orders", "order_items", "order_history"]) expect(t.raw.prepare(`SELECT COUNT(*) AS n FROM ${tb}`).get()).toEqual({ n: 0 });
    expect(await screen.findByText("Nenhum pedido ainda")).toBeInTheDocument();
  });

  test("erro ao excluir vira aviso", async () => {
    insertOrder({ productId: null });
    t.handlers["apply_stock"] = () => {
      throw "Pedido não encontrado.";
    };
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    await user.click(within(await screen.findByRole("dialog", { name: /Pedido #1/ })).getByRole("button", { name: "Excluir pedido" }));
    expect(await screen.findByText("Pedido não encontrado.")).toBeInTheDocument();
  });
});

describe("Pedidos: editar, detalhe e lista", () => {
  test("detalhe mostra itens, frete, total e histórico; Editar abre o formulário e salva", async () => {
    seed();
    insertOrder({ qty: 2, freight: 8, due: "2026-12-24" });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    const detail = await screen.findByRole("dialog", { name: "Pedido #1 · Bia" });
    expect(detail).toHaveTextContent("Prazo 24/12/2026");
    expect(detail).toHaveTextContent("Pagamento Pix");
    expect(detail).toHaveTextContent("Estoque não baixado");
    expect(within(detail).getByRole("row", { name: /Frete/ })).toHaveTextContent("R$ 8,00");
    expect(within(detail).getByRole("row", { name: /^Total R\$/ })).toHaveTextContent("R$ 38,00");
    expect(await within(detail).findByText("Pedido criado")).toBeInTheDocument();
    expect(detail).toHaveTextContent("01/09/2026 10:00");

    await user.click(within(detail).getByRole("button", { name: "Editar" }));
    const ed = await screen.findByRole("dialog", { name: "Pedido #1" });
    expect(within(ed).getByLabelText("Qtd")).toHaveValue("2");
    await user.clear(within(ed).getByLabelText("Qtd"));
    await user.type(within(ed).getByLabelText("Qtd"), "4");
    await user.click(within(ed).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Pedido atualizado.")).toBeInTheDocument();
    expect(t.raw.prepare("SELECT qty FROM order_items").all()).toEqual([{ qty: 4 }]);
  });

  test("A7: editar um pedido antigo mantém o custo e o tempo gravados, mesmo com o filamento mais caro hoje", async () => {
    seed();
    insertOrder({ qty: 2 });
    t.raw.exec("UPDATE order_items SET unitCost = 10, printMinutes = 30; UPDATE filaments SET pricePerKg = 900");
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Pedido #1 · Bia" })).getByRole("button", { name: "Editar" }));
    const ed = await screen.findByRole("dialog", { name: "Pedido #1" });
    await user.type(within(ed).getByLabelText(/^Observações/), "entregar à tarde");
    await user.click(within(ed).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Pedido atualizado.")).toBeInTheDocument();
    expect(t.raw.prepare("SELECT unitCost, printMinutes FROM order_items").all()).toEqual([{ unitCost: 10, printMinutes: 30 }]);
  });

  test("M17: produto cujo custo não dá para calcular (kit dentro de si mesmo) não grava custo 0", async () => {
    seed();
    t.raw.exec(`INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Kit', 'kit', '{"filaments":[],"materials":[],"items":[{"productId":2,"qty":1}]}', 1, 0, 30)`);
    insertOrder({ qty: 1 });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    await user.click(within(await screen.findByRole("dialog", { name: "Pedido #1 · Bia" })).getByRole("button", { name: "Editar" }));
    const ed = await screen.findByRole("dialog", { name: "Pedido #1" });
    await user.selectOptions(within(ed).getByLabelText("Produto"), "Kit");
    await user.click(within(ed).getByRole("button", { name: "Salvar alterações" }));
    expect(await within(ed).findByText(/Não deu para calcular o custo de: Kit/)).toBeInTheDocument();
    expect(t.raw.prepare("SELECT productId FROM order_items").all()).toEqual([{ productId: 1 }]);
  });

  test("com estoque baixado, editar quantidade é bloqueado com explicação", async () => {
    seed();
    insertOrder({});
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await user.click(await screen.findByRole("button", { name: "Iniciar produção →" }));
    await waitFor(() => expect(orderRow()).toMatchObject({ stockApplied: 1 }));
    await user.click(await screen.findByRole("button", { name: /Abrir pedido #1/ }));
    await user.click(within(await screen.findByRole("dialog", { name: /Pedido #1/ })).getByRole("button", { name: "Editar" }));
    const ed = await screen.findByRole("dialog", { name: "Pedido #1" });
    expect(within(ed).getByText(/O estoque deste pedido já foi baixado: para mudar/)).toBeInTheDocument();
    await user.clear(within(ed).getByLabelText("Qtd"));
    await user.type(within(ed).getByLabelText("Qtd"), "9");
    await user.click(within(ed).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findAllByText(/Volte para Pendente para mudar produtos ou quantidades/)).not.toHaveLength(0);
    expect(t.raw.prepare("SELECT qty FROM order_items").all()).toEqual([{ qty: 2 }]);
    await user.click(within(ed).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pedido #1" })).not.toBeInTheDocument());
  });

  test("lista: atrasados, filtro por status, busca por cliente/produto/#número e filtro vazio", async () => {
    insertOrder({ name: "Bia", due: "2020-01-01", productId: null });
    insertOrder({ name: "Caio", status: "delivered", due: "2020-01-01", productId: null, qty: 1 });
    insertOrder({ name: "Duda", productId: null });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    expect(await screen.findByRole("button", { name: /Abrir pedido #1 de Bia/ })).toHaveTextContent("atrasado");
    await user.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.getByRole("row", { name: /Bia/ })).toHaveTextContent("atrasado · 01/01");
    expect(screen.getByRole("row", { name: /Caio/ })).not.toHaveTextContent("atrasado");
    expect(screen.getByRole("row", { name: /Duda/ })).toHaveTextContent("sem prazo");
    await user.selectOptions(screen.getByLabelText("Status"), "Entregue");
    expect(screen.queryByRole("row", { name: /Bia/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Caio/ })).toHaveTextContent("R$ 15,00");
    await user.selectOptions(screen.getByLabelText("Status"), "Todos");
    await user.type(screen.getByLabelText("Buscar"), "#3");
    expect(screen.getAllByRole("row")).toHaveLength(2); // cabeçalho + Duda
    expect(screen.getByRole("row", { name: /Duda/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Buscar"));
    await user.type(screen.getByLabelText("Buscar"), "xyz");
    expect(screen.getByText("Nenhum pedido com esses filtros.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Buscar"));
    await user.click(screen.getByRole("row", { name: /Caio/ }));
    expect(await screen.findByRole("dialog", { name: "Pedido #2 · Caio" })).toBeInTheDocument();
  });

  test("busca global abre o pedido; Fechar volta ao quadro", async () => {
    insertOrder({ productId: null });
    setPendingOpen({ pageId: "orders", recordId: 1 });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    const detail = await screen.findByRole("dialog", { name: /Pedido #1/ });
    await user.click(within(detail).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("erro ao carregar o histórico vira aviso", async () => {
    insertOrder({ productId: null });
    const user = userEvent.setup();
    renderWithApp(<Orders />);
    await screen.findByRole("button", { name: /Abrir pedido #1/ });
    t.raw.exec("DROP TABLE order_history");
    await user.click(screen.getByRole("button", { name: /Abrir pedido #1/ }));
    expect(await screen.findByText(/Erro ao carregar histórico/)).toBeInTheDocument();
  });
});
