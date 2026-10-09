// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { setPendingOpen } from "../ui/search";
import Customers from "./Customers";
import { rowAction } from "../test/rowMenu";

const t = setupTauri();

const PAULISTA = { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" };
const viaCep = (reply: (url: string) => Response | Promise<Response>) => {
  const f = vi.fn(async (url: string) => reply(url));
  vi.stubGlobal("fetch", f);
  return f;
};
afterEach(() => vi.unstubAllGlobals());

const openNew = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click((await screen.findAllByRole("button", { name: /Novo cliente|Cadastrar cliente/ }))[0]);
  return screen.findByRole("dialog", { name: "Novo cliente" });
};

describe("Clientes", () => {
  test("cadastro com CEP preenchendo o endereço; CPF inválido é barrado; lista formata e busca sem acento", async () => {
    const f = viaCep(() => Response.json(PAULISTA));
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    expect(await screen.findByText("Nenhum cliente ainda")).toBeInTheDocument();
    const sheet = await openNew(user);
    await user.type(within(sheet).getByLabelText(/^Nome/), "Ana Souza");
    await user.type(within(sheet).getByLabelText(/^CPF/), "111.111.111-11");
    await user.type(within(sheet).getByLabelText(/^CEP/), "01310100");
    await waitFor(() => expect(within(sheet).getByLabelText("Rua")).toHaveValue("Avenida Paulista"));
    expect(f).toHaveBeenCalledWith("https://viacep.com.br/ws/01310100/json/", expect.anything());
    expect(within(sheet).getByLabelText("Bairro")).toHaveValue("Bela Vista");
    expect(within(sheet).getByLabelText("Cidade")).toHaveValue("São Paulo");
    expect(within(sheet).getByLabelText("UF")).toHaveValue("SP");
    await user.type(within(sheet).getByLabelText("Número"), "1000");

    await user.click(within(sheet).getByRole("button", { name: "Cadastrar cliente" }));
    expect(await within(sheet).findByText("CPF inválido: confira os números.")).toBeInTheDocument();
    const cpf = within(sheet).getByLabelText(/^CPF/);
    await user.clear(cpf);
    await user.type(cpf, "529.982.247-25");
    await user.clear(within(sheet).getByLabelText(/^Desconto padrão/));
    await user.type(within(sheet).getByLabelText(/^Desconto padrão/), "7,5");
    await user.type(within(sheet).getByLabelText("Instagram"), "@anasouza");
    await user.type(within(sheet).getByLabelText(/^WhatsApp/), "21 99999-0000");
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar cliente" }));

    expect(await screen.findByText("Cliente cadastrado.")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    expect(row).toHaveTextContent("529.982.247-25");
    expect(row).toHaveTextContent("21 99999-0000 · @anasouza");
    expect(row).toHaveTextContent("São Paulo/SP");
    expect(row).toHaveTextContent("7,5%");
    expect(await t.db.select("SELECT document, discountPct, number, active FROM customers")).toEqual([{ document: "52998224725", discountPct: 7.5, number: "1000", active: 1 }]);

    await user.type(screen.getByLabelText("Buscar"), "SAO PAULO");
    expect(screen.getByRole("row", { name: /Ana Souza/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Buscar"));
    await user.type(screen.getByLabelText("Buscar"), "zzz");
    expect(screen.queryByRole("row", { name: /Ana Souza/ })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum cliente encontrado para “zzz”.")).toBeInTheDocument();
  });

  test("validação: nome obrigatório, e-mail, desconto acima de 100% e CNPJ para empresa", async () => {
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    const sheet = await openNew(user);
    await user.click(within(sheet).getByRole("button", { name: "Empresa" }));
    expect(within(sheet).getByLabelText(/^CNPJ/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText(/^CNPJ/), "123");
    await user.type(within(sheet).getByLabelText(/^E-mail/), "ana@");
    await user.clear(within(sheet).getByLabelText(/^Desconto padrão/));
    await user.type(within(sheet).getByLabelText(/^Desconto padrão/), "150");
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar cliente" }));
    expect(await within(sheet).findByText("Obrigatório.")).toBeInTheDocument();
    expect(within(sheet).getByText("E-mail inválido.")).toBeInTheDocument();
    expect(within(sheet).getByText("CPF tem 11 números e CNPJ tem 14.")).toBeInTheDocument();
    expect(within(sheet).getByText("Máximo 100%.")).toBeInTheDocument();
    expect(await t.db.select("SELECT id FROM customers")).toEqual([]);
  });

  test("B10: desconto padrão ilegível ('dez') avisa em vez de gravar 0", async () => {
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    const sheet = await openNew(user);
    await user.type(within(sheet).getByLabelText(/^Nome/), "Loja da Bia");
    await user.clear(within(sheet).getByLabelText(/Desconto/));
    await user.type(within(sheet).getByLabelText(/Desconto/), "dez");
    await user.click(within(sheet).getByRole("button", { name: /Cadastrar|Salvar/ }));
    expect(await within(sheet).findByText(/Digite o desconto/)).toBeInTheDocument();
    expect(await t.db.select("SELECT id FROM customers")).toEqual([]);
  });

  test("editar desativa o cliente; inativo aparece esmaecido com selo", async () => {
    t.raw.exec("INSERT INTO customers (kind, name, city, uf, discountPct, active) VALUES ('pf', 'Bia', 'Niterói', 'RJ', 0, 1)");
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    await rowAction(user, "Bia", "Editar");
    const sheet = await screen.findByRole("dialog", { name: "Editar Bia" });
    await user.click(within(sheet).getByLabelText("Cliente ativo"));
    await user.type(within(sheet).getByLabelText("Observações"), "só retira");
    await user.click(within(sheet).getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Cliente atualizado.")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Bia/ });
    await waitFor(() => expect(row).toHaveTextContent("inativo"));
    expect(row).toHaveClass("muted");
    expect(row).toHaveTextContent("—");
    expect(await t.db.select("SELECT active, notes FROM customers")).toEqual([{ active: 0, notes: "só retira" }]);
  });

  test("excluir pede confirmação; recusar mantém; erro do banco vira aviso", async () => {
    t.raw.exec("INSERT INTO customers (kind, name) VALUES ('pf', 'Bia'), ('pf', 'Caio')");
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    t.askAnswer = false;
    await rowAction(user, "Bia", "Excluir");
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|message"));
    expect(await t.db.select("SELECT name FROM customers ORDER BY id")).toHaveLength(2);
    t.askAnswer = true;
    await rowAction(user, "Bia", "Excluir");
    await waitFor(() => expect(screen.queryByRole("row", { name: /Bia/ })).not.toBeInTheDocument());
    expect(await t.db.select("SELECT name FROM customers")).toEqual([{ name: "Caio" }]);

    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("banco travado");
    };
    await rowAction(user, "Caio", "Excluir");
    expect(await screen.findByText("Não foi possível excluir: banco travado")).toBeInTheDocument();
  });

  test("busca global abre o cliente em edição; Cancelar fecha", async () => {
    t.raw.exec("INSERT INTO customers (kind, name) VALUES ('pf', 'Bia')");
    setPendingOpen({ pageId: "customers", recordId: 1 });
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    const sheet = await screen.findByRole("dialog", { name: "Editar Bia" });
    await user.click(within(sheet).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Endereço por CEP", () => {
  test("CEP não encontrado, sem internet e CEP curto mostram a mensagem e deixam editar à mão", async () => {
    let reply: () => Response | Promise<Response> = () => Response.json({ erro: true });
    viaCep(() => reply());
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    const sheet = await openNew(user);
    const cep = within(sheet).getByLabelText(/^CEP/);
    await user.type(cep, "99999999");
    expect(await within(sheet).findByText("CEP não encontrado.")).toBeInTheDocument();

    reply = () => Promise.reject(new TypeError("Failed to fetch"));
    await user.click(within(sheet).getByRole("button", { name: "Buscar endereço pelo CEP" }));
    expect(await within(sheet).findByText("Sem conexão para buscar o CEP. Preencha o endereço à mão.")).toBeInTheDocument();

    reply = () => new Response("", { status: 500 });
    await user.click(within(sheet).getByRole("button", { name: "Buscar endereço pelo CEP" }));
    expect(await within(sheet).findByText("Não consegui consultar o CEP agora.")).toBeInTheDocument();

    await user.clear(cep);
    await user.type(cep, "123");
    await user.click(within(sheet).getByRole("button", { name: "Buscar endereço pelo CEP" }));
    expect(await within(sheet).findByText("O CEP tem 8 números.")).toBeInTheDocument();

    await user.type(within(sheet).getByLabelText("Rua"), "Rua A");
    await user.type(within(sheet).getByLabelText("Complemento"), "fundos");
    await user.type(within(sheet).getByLabelText("UF"), "rj");
    expect(within(sheet).getByLabelText("UF")).toHaveValue("RJ");
    expect(within(sheet).getByLabelText("Rua")).toHaveValue("Rua A");
  });

  test("mostra 'Buscando…' e desabilita o botão enquanto consulta", async () => {
    let release!: () => void;
    viaCep(() => new Promise<Response>((r) => (release = () => r(Response.json(PAULISTA)))));
    const user = userEvent.setup();
    renderWithApp(<Customers />);
    const sheet = await openNew(user);
    await user.type(within(sheet).getByLabelText(/^CEP/), "01310-100");
    expect(await within(sheet).findByText("Buscando…")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Buscar endereço pelo CEP" })).toBeDisabled();
    release();
    await waitFor(() => expect(within(sheet).getByLabelText("Cidade")).toHaveValue("São Paulo"));
    expect(within(sheet).getByLabelText(/^CEP/)).toHaveValue("01310-100");
    expect(within(sheet).queryByText("Buscando…")).not.toBeInTheDocument();
  });
});
