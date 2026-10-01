// @vitest-environment happy-dom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import Filaments from "../pages/Filaments";
import Printers from "../pages/Printers";
import { renderWithApp, setupTauri } from "../test/harness";
import { setPendingOpen } from "./search";
import { UNDO_MS } from "./CrudPage";

const t = setupTauri();

describe("CrudPage (Impressoras)", () => {
  test("lista vazia mostra estado vazio e já foca o 1º campo; cadastra com Enter", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    expect(await screen.findByText("Nada cadastrado ainda.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Nome/)).toHaveFocus());
    await user.type(screen.getByLabelText(/^Nome/), "Bambu A1");
    await user.type(screen.getByLabelText(/^Potência/), "95{Enter}");
    expect(await screen.findByRole("row", { name: /Bambu A1/ })).toHaveTextContent("95");
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu A1", watts: 95 }]);
  });

  test("erros de validação em português, por campo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await screen.findByRole("heading", { name: "Adicionar impressora" }); // lista vazia: o formulário já vem aberto
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText("Obrigatório.")).toBeInTheDocument();
    expect(screen.getByText("Digite um número.")).toBeInTheDocument();
  });

  test("editar grava; 'Cancelar' fecha o formulário e o botão do título abre o de adicionar", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByRole("heading", { name: "Editar impressora" })).toBeInTheDocument();
    const watts = screen.getByLabelText(/^Potência/);
    await user.clear(watts);
    await user.type(watts, "180");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(async () => expect(await t.db.select("SELECT watts FROM printers")).toEqual([{ watts: 180 }]));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("heading", { name: /impressora$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adicionar impressora" }));
    expect(screen.getByRole("heading", { name: "Adicionar impressora" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Nome/)).toHaveFocus());
  });

  test("excluir some na hora; Desfazer traz de volta; sem desfazer apaga depois do prazo", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150), ('A1', 95)");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithApp(<Printers />);
    const row = await screen.findByRole("row", { name: /Ender/ });
    await user.click(within(row).getByRole("button", { name: "Excluir" }));
    expect(screen.queryByRole("row", { name: /Ender/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await screen.findByRole("row", { name: /Ender/ })).toBeInTheDocument();

    await user.click(within(screen.getByRole("row", { name: /A1/ })).getByRole("button", { name: "Excluir" }));
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 100));
    await waitFor(async () => expect(await t.db.select("SELECT name FROM printers")).toEqual([{ name: "Ender" }]));
    vi.useRealTimers();
  });

  test("busca global pede para abrir um registro: já abre em edição", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    setPendingOpen({ pageId: "printers", recordId: 1 });
    renderWithApp(<Printers />);
    expect(await screen.findByRole("heading", { name: "Editar impressora" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Ender");
  });
});

describe("CrudPage (Filamentos)", () => {
  test("reposição em rolos com preço em R$ atualiza estoque e custo médio", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','X',100,1000,100,200)");
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    const row = await screen.findByRole("row", { name: /PLA/ });
    expect(row).toHaveTextContent("estoque baixo");
    await user.click(within(row).getByRole("button", { name: "Repor" }));
    const qty = screen.getByLabelText("Quanto comprou");
    await user.clear(qty);
    await user.type(qty, "0,9 rolo");
    await user.type(screen.getByLabelText("Preço pago por kg"), "R$ 120{Enter}");
    await waitFor(async () => expect(await t.db.select("SELECT stockG, pricePerKg FROM filaments")).toEqual([{ stockG: 1000, pricePerKg: 118 }]));
  });

  test("erro do banco ao excluir volta a linha e avisa", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','X',100,1000,100,200)");
    t.handlers["plugin:sql|execute"] = (a) => {
      if (String(a.query).startsWith("DELETE")) throw new Error("disco cheio");
      return [0, 0];
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithApp(<Filaments />);
    await user.click(within(await screen.findByRole("row", { name: /PLA/ })).getByRole("button", { name: "Excluir" }));
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 100));
    expect(await screen.findByText(/Não foi possível excluir "PLA": disco cheio/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /PLA/ })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
