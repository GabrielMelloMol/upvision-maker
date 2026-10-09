// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Costs from "./Costs";
import { rowAction } from "../test/rowMenu";

const t = setupTauri();

const text = (el: Element) => (el.textContent ?? "").replace(/\u00a0/g, " ");
const insert = (sql: string, p: unknown[] = []) => t.db.execute(`INSERT INTO operational_costs (description, category, amount, frequency, startDate, endDate, printerId) VALUES ${sql}`, p);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});
afterEach(() => vi.useRealTimers());

describe("Custos operacionais", () => {
  test("vazio: cadastra um custo mensal pelo botão do estado vazio", async () => {
    const user = userEvent.setup();
    renderWithApp(<Costs />);
    await user.click(await screen.findByRole("button", { name: /Cadastrar custo/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo custo" });
    await waitFor(() => expect(within(dialog).getByLabelText(/^Descrição/)).toHaveFocus());
    expect(within(dialog).getByLabelText("Começa em")).toHaveValue("2026-06-15");
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Aluguel da sala");
    await user.type(within(dialog).getByLabelText("Categoria"), "Aluguel");
    await user.type(within(dialog).getByLabelText(/^Valor/), "1200,50");
    await user.type(within(dialog).getByLabelText(/Observações/), "contrato 12 meses");
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));

    expect(await screen.findByText("Custo salvo.")).toBeInTheDocument();
    expect(await t.db.select("SELECT description, category, amount, frequency, startDate, endDate, printerId, notes FROM operational_costs")).toEqual([
      { description: "Aluguel da sala", category: "Aluguel", amount: 1200.5, frequency: "monthly", startDate: "2026-06-15", endDate: null, printerId: null, notes: "contrato 12 meses" },
    ]);
    const row = await screen.findByRole("row", { name: /Aluguel da sala/ });
    expect(within(row).getAllByRole("cell").map(text).slice(1, 5)).toEqual(["Aluguel", "Mensal", "desde 15/06/2026", "R$ 1.200,50"]);
    expect(text(screen.getByText(/Custos recorrentes ativos/))).toBe("Custos recorrentes ativos: cerca de R$ 1.200,50 por mês.");
  });

  test("total mensal: semanal × 52/12, anual ÷ 12, único, encerrados e futuros fora; mostra impressora e período", async () => {
    await t.db.execute("INSERT INTO printers (id, name, watts) VALUES (1, 'Bambu A1', 95)");
    await insert(
      `('Internet', '', 120, 'weekly', '2026-01-01', NULL, NULL), ('Seguro', '', 1200, 'yearly', '2026-01-01', NULL, NULL),
       ('Impressora nova', '', 3000, 'once', '2026-03-10', NULL, 1), ('Parcela', '', 500, 'monthly', '2025-01-01', '2026-05-31', 1),
       ('Luz', '', 80, 'monthly', '2026-01-01', '2026-06-15', NULL), ('Loja nova', '', 900, 'monthly', '2027-01-01', NULL, NULL)`,
    );
    renderWithApp(<Costs />);
    // 120 × 52/12 = 520 + 1200/12 = 100 + Luz 80 (termina hoje, ainda ativo) = 700; "Loja nova" só começa em 2027
    expect(text(await screen.findByText(/Custos recorrentes ativos/))).toContain("R$ 700,00");
    const cells = (name: RegExp) => within(screen.getByRole("row", { name })).getAllByRole("cell").map(text);
    expect(cells(/Impressora nova/)[0]).toBe("Impressora novaBambu A1");
    expect(cells(/Impressora nova/).slice(2, 4)).toEqual(["Único", "10/03/2026"]);
    expect(cells(/Parcela/).slice(2, 4)).toEqual(["Mensal", "desde 01/01/2025 até 31/05/2026"]);
    expect(cells(/Internet/)[2]).toBe("Semanal");
    expect(cells(/Seguro/)[2]).toBe("Anual");
  });

  test("validação em português e data final antes do início", async () => {
    const user = userEvent.setup();
    renderWithApp(<Costs />);
    await user.click(await screen.findByRole("button", { name: /Novo custo/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo custo" });
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));
    expect(await within(dialog).findByText("Obrigatório.")).toBeInTheDocument();
    expect(within(dialog).getByText("Digite um número.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Descrição/)).toHaveAttribute("aria-invalid", "true");

    await user.type(within(dialog).getByLabelText(/^Descrição/), "Parcela");
    await user.type(within(dialog).getByLabelText(/^Valor/), "0");
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));
    expect(await within(dialog).findByText("Precisa ser maior que 0.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/^Valor/));
    await user.type(within(dialog).getByLabelText(/^Valor/), "300");
    await user.type(within(dialog).getByLabelText(/Termina em/), "2026-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));
    expect(await within(dialog).findByText("A data final vem antes do início.")).toBeInTheDocument();
    expect(await t.db.select("SELECT * FROM operational_costs")).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("custo único: troca o rótulo da data, esconde 'Termina em' e grava sem data final", async () => {
    await t.db.execute("INSERT INTO printers (id, name, watts) VALUES (1, 'Bambu A1', 95)");
    const user = userEvent.setup();
    renderWithApp(<Costs />);
    await user.click(await screen.findByRole("button", { name: /Novo custo/ }));
    const dialog = screen.getByRole("dialog", { name: "Novo custo" });
    await user.type(within(dialog).getByLabelText(/Termina em/), "2026-12-31");
    await user.selectOptions(within(dialog).getByLabelText("Frequência"), "once");
    expect(within(dialog).getByLabelText("Data")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Termina em/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Descrição/), "Bico novo");
    await user.type(within(dialog).getByLabelText(/^Valor/), "45,9");
    await user.selectOptions(within(dialog).getByLabelText(/Impressora/), "Bambu A1");
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));
    await waitFor(async () => expect(await t.db.select("SELECT amount, frequency, endDate, printerId FROM operational_costs")).toEqual([{ amount: 45.9, frequency: "once", endDate: null, printerId: 1 }]));
    // só custo único: nada recorrente
    expect(text(await screen.findByText(/Custos recorrentes ativos/))).toContain("R$ 0,00");
  });

  test("editar abre preenchido e grava a alteração", async () => {
    await insert("('Internet', 'Internet', 99.9, 'monthly', '2026-01-05', '2026-12-05', NULL)");
    const user = userEvent.setup();
    renderWithApp(<Costs />);
    await rowAction(user, "Internet", "Editar");
    const dialog = screen.getByRole("dialog", { name: "Editar custo" });
    expect(within(dialog).getByLabelText(/^Valor/)).toHaveValue("99,90");
    expect(within(dialog).getByLabelText(/Termina em/)).toHaveValue("2026-12-05");
    await user.clear(within(dialog).getByLabelText(/^Valor/));
    await user.type(within(dialog).getByLabelText(/^Valor/), "129,9");
    await user.click(within(dialog).getByRole("button", { name: "Salvar custo" }));
    await waitFor(async () => expect(await t.db.select("SELECT amount, endDate FROM operational_costs")).toEqual([{ amount: 129.9, endDate: "2026-12-05" }]));
    expect(await screen.findByRole("row", { name: /Internet/ })).toHaveTextContent("129,90");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("excluir pergunta antes; 'Cancelar' mantém; erro do banco vira toast", async () => {
    await insert("('Internet', '', 100, 'monthly', '2026-01-01', NULL, NULL)");
    const user = userEvent.setup();
    renderWithApp(<Costs />);
    t.askAnswer = false;
    await rowAction(user, "Internet", "Excluir");
    expect(t.calls).toContain("plugin:dialog|message");
    expect(await t.db.select("SELECT id FROM operational_costs")).toHaveLength(1);

    t.askAnswer = true;
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("banco travado");
    };
    await rowAction(user, "Internet", "Excluir");
    expect(await screen.findByRole("alert")).toHaveTextContent("banco travado");
    delete t.handlers["plugin:sql|execute"];

    await rowAction(user, "Internet", "Excluir");
    expect(await screen.findByText("Nenhum custo cadastrado")).toBeInTheDocument();
    expect(await t.db.select("SELECT id FROM operational_costs")).toEqual([]);
  });
});
