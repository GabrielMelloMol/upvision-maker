// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import Filaments from "../pages/Filaments";
import Printers from "../pages/Printers";
import { renderWithApp, setupTauri } from "../test/harness";
import { setPendingOpen } from "./search";
import { UNDO_MS } from "./CrudPage";

const t = setupTauri();

describe("CrudPage (Impressoras)", () => {
  test("lista vazia mostra o estado vazio sem abrir nada; o botão do vazio abre o cadastro com o cursor no 1º campo; cadastra com Enter", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    expect(await screen.findByText("Nada cadastrado ainda.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // #178: nada abre sozinho, como em Clientes e Produtos
    await user.click(screen.getByRole("button", { name: "Cadastrar impressora" }));
    const sheet = await screen.findByRole("dialog", { name: "Adicionar impressora" });
    await waitFor(() => expect(within(sheet).getByLabelText(/^Nome/)).toHaveFocus());
    await user.type(within(sheet).getByLabelText(/^Nome/), "Bambu A1");
    await user.type(within(sheet).getByLabelText(/^Potência/), "95{Enter}");
    expect(await screen.findByRole("row", { name: /Bambu A1/ })).toHaveTextContent("95");
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu A1", watts: 95 }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); // salvar fecha a folha
  });

  test("o botão do título abre o cadastro; erros de validação em português, por campo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    const sheet = await screen.findByRole("dialog", { name: "Adicionar impressora" });
    await user.click(within(sheet).getByRole("button", { name: "Adicionar" }));
    expect(await within(sheet).findByText("Obrigatório.")).toBeInTheDocument();
    expect(within(sheet).getByText("Digite um número.")).toBeInTheDocument();
  });

  test("'Adicionar e cadastrar outro' grava, mantém a folha aberta e os campos fixos (marca, preço, rolo) para o próximo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Adicionar filamento" }));
    const sheet = await screen.findByRole("dialog", { name: "Adicionar filamento" });
    await user.type(within(sheet).getByLabelText(/^Marca/), "Voolt");
    await user.type(within(sheet).getByLabelText("Preço por kg"), "100");
    await user.click(within(sheet).getByRole("radio", { name: "Azul" }));
    await user.click(within(sheet).getByRole("button", { name: "Adicionar e cadastrar outro" }));
    await waitFor(async () => expect(await t.db.select("SELECT brand, color FROM filaments")).toEqual([{ brand: "Voolt", color: "Azul" }]));
    expect(screen.getByRole("dialog", { name: "Adicionar filamento" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText(/^Marca/)).toHaveValue("Voolt"); // fixo
    expect(within(screen.getByRole("dialog")).getByLabelText("Preço por kg")).toHaveValue("100,00");
    await user.click(within(screen.getByRole("dialog")).getByRole("radio", { name: "Branco" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Adicionar" }));
    await waitFor(async () => expect(await t.db.select("SELECT color FROM filaments ORDER BY id")).toEqual([{ color: "Azul" }, { color: "Branco" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("Esc e Cancelar fecham a folha sem gravar; editar não oferece 'cadastrar outro'", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.type(await screen.findByLabelText(/^Nome/), "Rascunho");
    // o happy-dom não transforma Esc dentro de um campo em "cancel" da <dialog> como o navegador faz: dispara o evento direto
    // (a tecla de verdade, com o cursor no campo, fica no E2E tests/e2e/estoque-cadastro.e2e.ts)
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Editar Ender" }));
    const sheet = await screen.findByRole("dialog", { name: "Editar impressora" });
    expect(within(sheet).queryByRole("button", { name: "Adicionar e cadastrar outro" })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await t.db.select("SELECT name FROM printers")).toEqual([{ name: "Ender" }]);
  });

  test("editar grava e fecha a folha; o botão do título abre de novo o cadastro, com o cursor no 1º campo", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: /^Editar / }));
    const sheet = await screen.findByRole("dialog", { name: "Editar impressora" });
    const watts = within(sheet).getByLabelText(/^Potência/);
    await user.clear(watts);
    await user.type(watts, "180");
    await user.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    await waitFor(async () => expect(await t.db.select("SELECT watts FROM printers")).toEqual([{ watts: 180 }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Adicionar impressora" }));
    const again = await screen.findByRole("dialog", { name: "Adicionar impressora" });
    await waitFor(() => expect(within(again).getByLabelText(/^Nome/)).toHaveFocus());
  });

  test("excluir some na hora; Desfazer traz de volta; sem desfazer apaga depois do prazo", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Ender', 150), ('A1', 95)");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithApp(<Printers />);
    const row = await screen.findByRole("row", { name: /Ender/ });
    await user.click(within(row).getByRole("button", { name: /^Excluir / }));
    expect(screen.queryByRole("row", { name: /Ender/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await screen.findByRole("row", { name: /Ender/ })).toBeInTheDocument();

    await user.click(within(screen.getByRole("row", { name: /A1/ })).getByRole("button", { name: /^Excluir / }));
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
    await user.click(within(await screen.findByRole("row", { name: /PLA/ })).getByRole("button", { name: /^Excluir / }));
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 100));
    expect(await screen.findByText(/Não foi possível excluir "PLA": disco cheio/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /PLA/ })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
