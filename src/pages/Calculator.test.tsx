// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Calculator from "./Calculator";
import { clearProductDraft, peekProductDraft } from "./products/draft";

const t = setupTauri();
const brl = (s: string) => new RegExp(`R\\$\\s${s}`);
/** Valor da linha "Custo por peça" na tabela de resultado. */
const unitCost = () => within(screen.getByRole("row", { name: /^Custo por peça/ })).getAllByRole("columnheader")[1];

beforeEach(async () => {
  clearProductDraft();
  // Casos antigos: modo Completo, manutenção 5% e sem taxa de falha (os números abaixo são desse jeito).
  localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} }));
  await t.db.execute(`INSERT INTO settings (id, data) VALUES (1, '{"maintenancePct":5,"failurePct":0}')`);
});

describe("Calculator", () => {
  test("filamento digitado à mão + manutenção de 5% dão o custo por peça e os preços", async () => {
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.type(screen.getByLabelText("Preço por kg"), "100");
    await user.type(screen.getByLabelText("Gramas"), "200");
    expect(unitCost()).toHaveTextContent(brl("21,00"));

    const qty = screen.getByLabelText("Peças na mesa");
    await user.clear(qty);
    await user.type(qty, "2");
    expect(unitCost()).toHaveTextContent(brl("10,50"));
    expect(screen.getByRole("row", { name: /^Para lojista/ })).toHaveTextContent(brl("31,50"));
    expect(screen.getByRole("row", { name: /^Shopee/ })).toBeInTheDocument();
  });

  test("escolher impressora e filamento cadastrados preenche potência e preço; editar à mão desvincula", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95.5)");
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Preto', 'Voolt', 120)");
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await screen.findByRole("option", { name: "Bambu A1" });

    await user.selectOptions(screen.getByLabelText("Impressora"), "Bambu A1");
    expect(screen.getByLabelText("Potência (W)")).toHaveValue("95,5");
    await user.type(screen.getByLabelText("Potência (W)"), "0");
    expect(screen.getByLabelText("Impressora")).toHaveValue("");

    await user.selectOptions(screen.getByLabelText("Cadastrado"), "PLA · Preto · Voolt");
    expect(screen.getByLabelText("Preço por kg")).toHaveValue("120,00");
    await user.type(screen.getByLabelText("Preço por kg"), "1");
    expect(screen.getByLabelText("Cadastrado")).toHaveValue("");
  });

  test("energia e mão de obra usam as preferências", async () => {
    await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"kwhPrice":1,"laborHourCost":60,"maintenancePct":0,"multResale":2,"multConsumer":4,"marketplaceMarginPct":30,"channels":[],"failurePct":0}')`);
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await screen.findByText(/×4/);
    await user.type(screen.getByLabelText("Potência (W)"), "100");
    await user.type(screen.getByLabelText("Tempo de impressão"), "10");
    await user.type(screen.getByLabelText("Mão de obra"), "30");
    expect(screen.getByRole("row", { name: /^Energia/ })).toHaveTextContent(brl("1,00"));
    expect(screen.getByRole("row", { name: /^Mão de obra/ })).toHaveTextContent(brl("30,00"));
    expect(unitCost()).toHaveTextContent(brl("31,00"));
  });

  test("materiais extras entram no custo; remover linha tira do cálculo", async () => {
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice) VALUES ('Argola', 'un', 2)");
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Adicionar material" }));
    const extras = screen.getByRole("heading", { name: "Materiais extras" }).parentElement!;
    await user.selectOptions(await within(extras).findByLabelText("Cadastrado"), "Argola (un)");
    expect(screen.getByLabelText("Preço unitário")).toHaveValue("2,00");
    await user.type(screen.getByLabelText("Quantidade"), "3");
    expect(screen.getByRole("row", { name: /^Materiais extras/ })).toHaveTextContent(brl("6,00"));
    const matLine = screen.getByLabelText("Quantidade").closest(".line") as HTMLElement;
    await user.click(within(matLine).getByRole("button", { name: "Remover" }));
    expect(screen.getByRole("row", { name: /^Materiais extras/ })).toHaveTextContent(brl("0,00"));
  });

  test("margem de marketplace alta demais avisa em vez de dar preço", async () => {
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.type(screen.getByLabelText("Margem em marketplace (%)"), "90");
    expect(screen.getByRole("row", { name: /^Shopee/ })).toHaveTextContent("Taxa + margem passam de 100%");
  });

  test("canais lado a lado (#4): melhor lucro, arredondamento, concorrente com prejuízo e margem mínima", async () => {
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.type(screen.getByLabelText("Preço por kg"), "100");
    await user.type(screen.getByLabelText("Gramas"), "200"); // custo por peça R$ 21,00
    const row = (name: RegExp) => screen.getByRole("row", { name });
    expect(row(/^Venda direta/)).toHaveTextContent("melhor lucro");
    expect(row(/^Shopee/)).toHaveTextContent(brl("50,00")); // (21 + 4) ÷ (1 − 20% − 30%)

    await user.click(screen.getByRole("button", { name: ",90" }));
    const shopee = within(row(/^Shopee/)).getAllByRole("cell").map((c) => c.textContent!.replace(/\u00a0/g, " "));
    expect(shopee.slice(1, 4)).toEqual(["R$ 50,90", "R$ 14,18", "R$ 15,72"]); // taxas e lucro no preço arredondado

    await user.type(screen.getByLabelText("Preço do concorrente"), "30");
    expect(screen.getByRole("columnheader", { name: "Lucro no preço do concorrente" })).toBeInTheDocument();
    expect(row(/^Shopee/)).toHaveTextContent(/-R\$\s1,00\s*prejuízo/); // 30 − (6 + 4) − 21
    expect(row(/^Venda direta/)).not.toHaveTextContent("prejuízo");
    expect(screen.getByText(/^\d+% acima do concorrente/)).toBeInTheDocument();
  });

  test("margem mínima das preferências marca o canal abaixo dela", async () => {
    await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"multResale":1.05,"minMarginPct":10,"failurePct":0,"maintenancePct":5}')`);
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.type(await screen.findByLabelText("Preço por kg"), "100");
    await user.type(screen.getByLabelText("Gramas"), "200");
    await waitFor(() => expect(screen.getByRole("row", { name: /^Para lojista/ })).toHaveTextContent("abaixo da margem mínima"));
  });

  test("salvar como produto leva só linhas cadastradas, avisa as puladas e abre Produtos", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Preto', '', 100)");
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Calculator go={go} />);
    await screen.findByRole("option", { name: "PLA · Preto" });
    await user.selectOptions(screen.getByLabelText("Cadastrado"), "PLA · Preto");
    await user.type(screen.getByLabelText("Gramas"), "50");
    await user.click(screen.getByRole("button", { name: "Adicionar filamento" }));
    await user.selectOptions(screen.getByLabelText("Impressora"), "A1");
    await user.type(screen.getByLabelText("Tempo de impressão"), "1h30");
    await user.click(screen.getByRole("button", { name: "Salvar como produto" }));

    expect(go).toHaveBeenCalledWith("products");
    expect(peekProductDraft()).toMatchObject({
      composition: { filaments: [{ filamentId: 1, grams: 50 }], materials: [], items: [] },
      printerId: 1,
      printMinutes: 90,
      piecesPerPlate: 1,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("1 linha(s) sem item cadastrado ficaram de fora do produto.");
  });

  test("arquivo do fatiador preenche filamentos, impressora, tempo e peças", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 110)");
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Azul', 'Bambu', 120), ('PLA', 'Branco', 'Bambu', 110)");
    const name = "bambu-a1-2cores-fatiado.3mf";
    const file = new File([readFileSync(resolve(__dirname, "../../tests/fixtures/slicer", name))], name);
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await screen.findByRole("option", { name: "A1" });
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);

    await waitFor(() => expect(screen.getByLabelText("Impressora")).toHaveValue("1"));
    expect(screen.getByLabelText("Potência (W)")).toHaveValue("110");
    expect(screen.getByLabelText("Tempo de impressão")).toHaveValue("21 min");
    expect(screen.getByLabelText("Peças na mesa")).toHaveValue("3");
    expect(screen.getAllByLabelText("Gramas").map((i) => (i as HTMLInputElement).value)).toEqual(["3,79", "0,55"]);
    expect(screen.getAllByLabelText("Preço por kg").map((i) => (i as HTMLInputElement).value)).toEqual(["120,00", "110,00"]);
  });
});

describe("Calculadora (#22)", () => {
  beforeEach(async () => {
    localStorage.removeItem("upvision:calculadora");
    await t.db.execute("DELETE FROM settings"); // padrões: falha 5%, sem manutenção
  });

  test("abre no Rápido; 'Ver detalhes' leva os valores para o Completo e volta; lembra o último cálculo", async () => {
    const user = userEvent.setup();
    const first = renderWithApp(<Calculator go={() => {}} />);
    expect(screen.getByRole("button", { name: "Rápido" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Materiais extras")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Preço por kg"), "100");
    await user.type(screen.getByLabelText("Gramas"), "200");
    await user.type(screen.getByLabelText("Tempo de impressão"), "2h");
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(screen.getByRole("button", { name: "Completo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Gramas")).toHaveValue("200");
    expect(screen.getByLabelText("Tempo de impressão")).toHaveValue("2h");
    expect(unitCost()).toHaveTextContent(brl("21,05")); // 20 + falha 5% (20 ÷ 0,95 − 20)
    expect(screen.getByRole("row", { name: /^Falhas · 5 %/ })).toHaveTextContent(brl("1,05"));
    first.unmount();

    renderWithApp(<Calculator go={() => {}} />);
    expect(screen.getByRole("button", { name: "Completo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Gramas")).toHaveValue("200");
    await user.click(screen.getByRole("button", { name: "Limpar" }));
    expect(screen.getByLabelText("Gramas")).toHaveValue("");
  });

  test("impressora com preço cobra a máquina por hora; nomes dos preços explicados", async () => {
    await t.db.execute("INSERT INTO printers (name, watts, price, lifeHours) VALUES ('Bambu Lab A1', 95, 3000, 5000)");
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Completo" }));
    await user.selectOptions(await screen.findByLabelText("Impressora"), "Bambu Lab A1");
    await user.type(screen.getByLabelText("Tempo de impressão"), "2h30");
    expect(screen.getByRole("row", { name: /^Máquina · R\$\s0,60\/h/ })).toHaveTextContent(brl("1,50"));
    expect(screen.getByText("Bambu Lab A1: 95 W (oficial)")).toBeInTheDocument();
    expect(screen.getByText(/Para lojista \(revenda\) ×3/)).toBeInTheDocument();
    expect(screen.getByText(/Venda direta \(consumidor final\) ×5/)).toBeInTheDocument();
    expect(screen.getByText("markup 400 % · margem 80 % antes das taxas")).toBeInTheDocument();
    await user.click(screen.getByText("Qual preço usar?"));
    expect(screen.getByText(/loja, papelaria/)).toBeVisible();
  });

  test("medir com tomada inteligente: kWh início/fim + duração → W médio, gravado na impressora", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95)");
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Completo" }));
    await user.selectOptions(await screen.findByLabelText("Impressora"), "Bambu Lab A1");
    await user.click(screen.getByRole("button", { name: /Medir com tomada inteligente/ }));
    const sheet = await screen.findByRole("dialog", { name: "Medir com tomada inteligente" });
    await user.type(within(sheet).getByLabelText("kWh no início"), "52,16");
    await user.type(within(sheet).getByLabelText("kWh no fim"), "52,46");
    await user.type(within(sheet).getByLabelText("Duração da impressão"), "3h");
    await user.click(within(sheet).getByRole("button", { name: "Usar 100 W" }));
    expect(screen.getByLabelText("Potência (W)")).toHaveValue("100");
    await waitFor(async () => expect(await t.db.select("SELECT watts FROM printers")).toEqual([{ watts: 100 }]));
  });

  test("kWh medido desta impressão substitui potência × tempo", async () => {
    await t.db.execute(`INSERT INTO settings (id, data) VALUES (1, '{"kwhPrice":1,"failurePct":0}')`);
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Completo" }));
    await user.type(screen.getByLabelText("Potência (W)"), "200");
    await user.type(screen.getByLabelText("Tempo de impressão"), "5h");
    await waitFor(() => expect(screen.getByRole("row", { name: /^Energia/ })).toHaveTextContent(brl("1,00")));
    await user.type(screen.getByLabelText("kWh medido desta impressão"), "0,3");
    expect(screen.getByRole("row", { name: /^Energia/ })).toHaveTextContent(brl("0,30"));
  });

  test("embalagem padrão das Preferências já entra nos materiais extras", async () => {
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice) VALUES ('Caixinha', 'un', 2)");
    await t.db.execute(`INSERT INTO settings (id, data) VALUES (1, '{"packagingMaterialId":1}')`);
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Completo" }));
    await waitFor(() => expect(screen.getByRole("row", { name: /^Materiais extras/ })).toHaveTextContent(brl("2,00")));
  });
});
