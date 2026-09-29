// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { todayIso } from "../domain/orders";
import { addDays } from "../domain/quotes";
import { renderWithApp, setupTauri } from "../test/harness";
import Quotes from "./Quotes";

// As fontes vêm por fetch de URL do Vite no app; aqui lê direto do disco (igual a src/pdf/pdf.test.ts).
const pdfFonts = vi.hoisted(() => ({ fail: false }));
vi.mock("../pdf/fonts", () => ({
  loadPdfFonts: async () => {
    if (pdfFonts.fail) throw new Error("fonte não encontrada");
    const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
    return { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
  },
}));

const t = setupTauri();

const COMPANY = '{"name":"UpVision 3D","city":"Rio de Janeiro","pixKey":"52998224725","quoteValidityDays":7,"quoteTerms":"50% na aprovação."}';
const seed = (company = COMPANY) =>
  t.raw.exec(`INSERT INTO company (id, data) VALUES (1, '${company}');
    INSERT INTO customers (kind, name, discountPct, active, phone) VALUES ('pj', 'Loja da Bia', 0, 1, '21 9999-0000');
    INSERT INTO products (name, kind, composition, piecesPerPlate, manualPrice, consignmentPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[],"materials":[],"items":[]}', 1, 15, 8),
      ('Ímã', 'simple', '{"filaments":[],"materials":[],"items":[]}', 1, 10, NULL);
    INSERT INTO product_photos (productId, position, dataUrl) VALUES (1, 0, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');`);

const quoteJson = (o: { name?: string; validUntil?: string; qty?: number }) =>
  JSON.stringify({
    customerId: null,
    customerName: o.name ?? "Ana Souza",
    channel: "Consumidor final",
    dueDate: null,
    paymentMethod: "Pix",
    notes: "",
    freight: 0,
    validUntil: o.validUntil ?? addDays(todayIso(), 7),
    terms: "50% na aprovação.",
    items: [{ productId: 1, description: "Chaveiro", qty: o.qty ?? 10, unitPrice: 15, discountPct: 0, unitCost: 0, printMinutes: 0 }],
  });
const insertQuote = (o: Parameters<typeof quoteJson>[0] = {}, convertedOrderId: number | null = null) =>
  t.raw.prepare("INSERT INTO quotes (data, createdAt, convertedOrderId) VALUES (?, '2026-09-28 10:00:00', ?)").run(quoteJson(o), convertedOrderId);

const pdfs = () => [...t.files.entries()].filter(([p]) => p.endsWith(".pdf"));
const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.subarray(0, 5)) === "%PDF-";

const setup = () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Quotes go={go} />);
  return { go, user };
};

describe("Orçamentos", () => {
  test("cria com validade e condições padrão da empresa; total na lista", async () => {
    seed();
    const { user } = setup();
    expect(await screen.findByText("Nenhum orçamento ainda")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Novo orçamento|Fazer um orçamento/ })[0]);
    const sheet = await screen.findByRole("dialog", { name: "Novo orçamento" });
    expect(within(sheet).getByLabelText("Válido até")).toHaveValue(addDays(todayIso(), 7));
    expect(within(sheet).getByLabelText("Condições comerciais")).toHaveValue("50% na aprovação.");
    await user.type(within(sheet).getByLabelText(/^Nome do cliente/), "Ana Souza");
    await user.click(within(sheet).getByRole("button", { name: "Adicionar item" }));
    await user.selectOptions(within(sheet).getByLabelText("Produto"), "Chaveiro");
    await user.clear(within(sheet).getByLabelText("Qtd"));
    await user.type(within(sheet).getByLabelText("Qtd"), "10");
    await user.clear(within(sheet).getByLabelText("Condições comerciais"));
    await user.type(within(sheet).getByLabelText("Condições comerciais"), "À vista.");
    await user.click(within(sheet).getByRole("button", { name: "Criar orçamento" }));

    expect(await screen.findByText("Orçamento nº 1 criado.")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    expect(row).toHaveTextContent("R$ 150,00");
    expect(row).toHaveTextContent("aberto");
    expect(row).toHaveTextContent(addDays(todayIso(), 7).split("-").reverse().join("/"));
    const data = JSON.parse((t.raw.prepare("SELECT data FROM quotes").get() as { data: string }).data);
    expect(data).toMatchObject({ customerName: "Ana Souza", terms: "À vista.", validUntil: addDays(todayIso(), 7), items: [{ productId: 1, qty: 10, unitPrice: 15 }] });
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 0 }); // orçamento não é pedido
  });

  test("editar grava as mudanças; vencido aparece com selo", async () => {
    seed();
    insertQuote({ validUntil: "2020-01-01" });
    const { user } = setup();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    expect(row).toHaveTextContent("vencido");
    await user.click(within(row).getByRole("button", { name: "Editar orçamento 1" }));
    const sheet = await screen.findByRole("dialog", { name: "Orçamento nº 1" });
    const until = within(sheet).getByLabelText("Válido até");
    await user.clear(until);
    await user.type(until, "2099-12-31");
    await user.click(within(sheet).getByRole("button", { name: "Salvar orçamento" }));
    expect(await screen.findByText("Orçamento atualizado.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("row", { name: /Ana Souza/ })).toHaveTextContent("aberto"));
    expect(JSON.parse((t.raw.prepare("SELECT data FROM quotes").get() as { data: string }).data).validUntil).toBe("2099-12-31");
  });

  test("PDF com Pix é salvo com nome do cliente; cancelar o 'Salvar como' não grava", async () => {
    seed();
    insertQuote();
    const { user } = setup();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    t.savePath = () => null;
    await user.click(within(row).getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|save"));
    expect(pdfs()).toEqual([]);

    t.savePath = (n) => `/saida/${n}`;
    await user.click(within(row).getByRole("button", { name: "PDF" }));
    expect(await screen.findByText("Orçamento salvo em /saida/orcamento-1-ana-souza.pdf")).toBeInTheDocument();
    expect(isPdf(pdfs()[0][1])).toBe(true);
  });

  test("PDF sai sem QR quando o Pix está incompleto, e avisa o motivo", async () => {
    seed('{"pixKey":"52998224725"}');
    insertQuote();
    const { user, go } = setup();
    // sem nome da empresa: dica leva aos Dados da empresa
    await user.click(await screen.findByRole("button", { name: "Dados da empresa" }));
    expect(go).toHaveBeenCalledWith("company");
    await user.click(within(screen.getByRole("row", { name: /Ana Souza/ })).getByRole("button", { name: "PDF" }));
    expect(await screen.findByText(/PDF salvo sem o QR Pix \(Informe o nome de quem recebe o Pix\.\) em \/saida\/orcamento-1/)).toBeInTheDocument();
    expect(pdfs()).toHaveLength(1);
  });

  test("erro ao gerar PDF vira aviso", async () => {
    seed();
    insertQuote();
    pdfFonts.fail = true;
    const { user } = setup();
    await user.click(within(await screen.findByRole("row", { name: /Ana Souza/ })).getByRole("button", { name: "PDF" }));
    expect(await screen.findByText("Não foi possível gerar o PDF: fonte não encontrada")).toBeInTheDocument();
    pdfFonts.fail = false;
  });

  test("virar pedido cria o pedido uma única vez e o link leva aos Pedidos", async () => {
    seed();
    insertQuote({ qty: 3 });
    const { user, go } = setup();
    await user.click(within(await screen.findByRole("row", { name: /Ana Souza/ })).getByRole("button", { name: "Virar pedido" }));
    expect(await screen.findByText("Orçamento nº 1 virou o pedido #1.")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    await waitFor(() => expect(row).toHaveTextContent("virou o pedido #1"));
    expect(within(row).queryByRole("button", { name: "Virar pedido" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Editar orçamento 1" })).not.toBeInTheDocument();
    expect(t.raw.prepare("SELECT customerName, quoteId, status FROM orders").all()).toEqual([{ customerName: "Ana Souza", quoteId: 1, status: "pending" }]);
    expect(t.raw.prepare("SELECT qty FROM order_items").all()).toEqual([{ qty: 3 }]);
    expect(t.raw.prepare("SELECT note FROM order_history").all()).toEqual([{ note: "Criado a partir do orçamento #1" }]);
    await user.click(within(row).getByRole("button", { name: "virou o pedido #1" }));
    expect(go).toHaveBeenCalledWith("orders");
  });

  test("virar pedido de orçamento já convertido por fora avisa e não duplica", async () => {
    seed();
    insertQuote();
    const { user } = setup();
    const row = await screen.findByRole("row", { name: /Ana Souza/ });
    t.raw.exec("UPDATE quotes SET convertedOrderId = 9");
    await user.click(within(row).getByRole("button", { name: "Virar pedido" }));
    expect(await screen.findByText("Este orçamento já virou o pedido #9.")).toBeInTheDocument();
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 0 });
  });

  test("excluir pede confirmação", async () => {
    seed();
    insertQuote({ name: "Ana" });
    insertQuote({ name: "Caio" }, 5);
    const { user } = setup();
    t.askAnswer = false;
    await user.click(await screen.findByRole("button", { name: "Excluir orçamento 1" }));
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|message"));
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM quotes").get()).toEqual({ n: 2 });
    t.askAnswer = true;
    await user.click(screen.getByRole("button", { name: "Excluir orçamento 2" }));
    await waitFor(() => expect(screen.queryByRole("row", { name: /Caio/ })).not.toBeInTheDocument());
    expect(t.raw.prepare("SELECT id FROM quotes").all()).toEqual([{ id: 1 }]);

    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("banco travado");
    };
    await user.click(screen.getByRole("button", { name: "Excluir orçamento 1" }));
    expect(await screen.findByText("Não foi possível excluir: banco travado")).toBeInTheDocument();
  });
});

describe("Contrato de consignação", () => {
  test("repasse vem do cadastro (ou da revenda), total em repasse e PDF salvo", async () => {
    seed();
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Contrato de consignação" }));
    const c = await screen.findByRole("dialog", { name: "Contrato de consignação" });
    const submit = within(c).getByRole("button", { name: "Salvar PDF do contrato" });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(c).getByLabelText("Consignatário (loja parceira)"), "Loja da Bia");
    await user.selectOptions(within(c).getByLabelText("Adicionar produto"), "Chaveiro");
    expect(within(c).getByLabelText("Repasse (R$)")).toHaveValue("8,00");
    expect(within(c).getByLabelText("Preço sugerido (R$)")).toHaveValue("15,00");
    await user.clear(within(c).getByLabelText("Qtd"));
    await user.type(within(c).getByLabelText("Qtd"), "20");
    expect(within(c).getByText(/Total em repasse: R\$ 160,00/)).toBeInTheDocument();

    await user.selectOptions(within(c).getByLabelText("Adicionar produto"), "Ímã");
    expect(within(c).getAllByLabelText("Repasse (R$)")[1]).toHaveValue("0,00"); // sem repasse e sem custo: revenda 0
    await user.clear(within(c).getAllByLabelText("Repasse (R$)")[1]);
    await user.type(within(c).getAllByLabelText("Repasse (R$)")[1], "5");
    expect(within(c).getByText(/Total em repasse: R\$ 165,00/)).toBeInTheDocument();
    await user.click(within(c).getAllByRole("button", { name: "Remover" })[1]);
    expect(within(c).getByText(/Total em repasse: R\$ 160,00/)).toBeInTheDocument();

    const date = within(c).getByLabelText("Data");
    await user.clear(date);
    await user.type(date, "2026-10-01");
    await user.clear(within(c).getByLabelText("Prazo (dias)"));
    await user.type(within(c).getByLabelText("Prazo (dias)"), "60");
    await user.type(within(c).getByLabelText("Acerto"), " Extra.");
    await user.click(submit);
    expect(await screen.findByText("Contrato salvo em /saida/consignacao-loja-da-bia-2026-10-01.pdf")).toBeInTheDocument();
    expect(isPdf(t.files.get("/saida/consignacao-loja-da-bia-2026-10-01.pdf")!)).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("erro na geração vira aviso e mantém a janela", async () => {
    seed();
    pdfFonts.fail = true;
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Contrato de consignação" }));
    const c = await screen.findByRole("dialog", { name: "Contrato de consignação" });
    await user.selectOptions(within(c).getByLabelText("Consignatário (loja parceira)"), "Loja da Bia");
    await user.selectOptions(within(c).getByLabelText("Adicionar produto"), "Chaveiro");
    await user.click(within(c).getByRole("button", { name: "Salvar PDF do contrato" }));
    expect(await screen.findByText("Não foi possível gerar: fonte não encontrada")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Contrato de consignação" })).toBeInTheDocument();
    pdfFonts.fail = false;
    await user.click(within(c).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Catálogo em PDF", () => {
  test("marca/desmarca produtos, escolhe o preço e salva com o título no nome do arquivo", async () => {
    seed();
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Catálogo PDF" }));
    const c = await screen.findByRole("dialog", { name: "Catálogo em PDF" });
    expect(within(c).getByText("(sem foto)")).toBeInTheDocument(); // só o Ímã
    expect(within(c).getByRole("button", { name: "Salvar PDF (2)" })).toBeEnabled();
    await user.click(within(c).getByRole("button", { name: "Desmarcar todos" }));
    expect(within(c).getByRole("button", { name: "Salvar PDF (0)" })).toBeDisabled();
    await user.click(within(c).getByRole("button", { name: "Marcar todos" }));
    await user.click(within(c).getByRole("checkbox", { name: /Ímã/ }));
    await user.click(within(c).getByRole("checkbox", { name: /Ímã/ }));
    await user.click(within(c).getByRole("checkbox", { name: /Ímã/ }));
    expect(within(c).getByRole("button", { name: "Salvar PDF (1)" })).toBeEnabled();
    await user.click(within(c).getByRole("button", { name: "Para lojista (revenda)" }));
    const title = within(c).getByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Natal 2026");
    await user.click(within(c).getByRole("button", { name: "Salvar PDF (1)" }));
    expect(await screen.findByText("Catálogo salvo em /saida/natal-2026.pdf")).toBeInTheDocument();
    expect(isPdf(t.files.get("/saida/natal-2026.pdf")!)).toBe(true);
  });

  test("título vazio usa 'catalogo'; cancelar o diálogo mantém a janela; erro vira aviso", async () => {
    seed();
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Catálogo PDF" }));
    const c = await screen.findByRole("dialog", { name: "Catálogo em PDF" });
    await user.clear(within(c).getByLabelText("Título"));
    const names: string[] = [];
    t.savePath = (n) => {
      names.push(n);
      return null;
    };
    await user.click(within(c).getByRole("button", { name: "Salvar PDF (2)" }));
    await waitFor(() => expect(names).toEqual(["catalogo.pdf"]));
    expect(screen.getByRole("dialog", { name: "Catálogo em PDF" })).toBeInTheDocument();
    pdfFonts.fail = true;
    await user.click(within(c).getByRole("button", { name: "Salvar PDF (2)" }));
    expect(await screen.findByText("Não foi possível gerar: fonte não encontrada")).toBeInTheDocument();
    pdfFonts.fail = false;
  });
});
