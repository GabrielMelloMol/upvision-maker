// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Calculator from "./Calculator";
import { clearProductDraft, peekProductDraft } from "./products/draft";
import { clearQuoteDraft, peekOpenQuoteDraft, peekQuoteDraft } from "./quotes/draft";

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

    await user.type(screen.getByLabelText("Testar um preço (seu ou do concorrente)"), "30");
    expect(screen.getByRole("columnheader", { name: "Lucro no preço testado" })).toBeInTheDocument();
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

test("impressora do catálogo na calculadora (#21): cadastra na hora e já preenche a potência; repetir não duplica", async () => {
  localStorage.removeItem("upvision:calculadora");
  const user = userEvent.setup();
  renderWithApp(<Calculator go={() => {}} />);
  await user.click(screen.getByRole("button", { name: "Completo" }));
  for (let i = 0; i < 2; i++) {
    await user.click(screen.getByRole("button", { name: "Escolher do catálogo" }));
    const cat = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.type(within(cat).getByRole("combobox", { name: "Buscar no catálogo" }), "k1c");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByLabelText("Impressora")).toHaveDisplayValue("Creality K1C"));
  }
  expect(screen.getByLabelText("Potência (W)")).toHaveValue("120");
  expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Creality K1C", watts: 120 }]);
});

test("adicionar ao orçamento (#28): soma cálculos num rascunho com preço, custo e minutos por peça; Abrir vai para Orçamentos", async () => {
  localStorage.removeItem("upvision:calculadora");
  clearQuoteDraft();
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Calculator go={go} />);
  await user.type(screen.getByLabelText("Preço por kg"), "100");
  await user.type(screen.getByLabelText("Gramas"), "200"); // mesa R$ 20 + manutenção 5% (preferências do beforeEach) = 21
  await user.type(screen.getByLabelText("Tempo de impressão"), "2h");
  await user.clear(screen.getByLabelText("Peças na mesa"));
  await user.type(screen.getByLabelText("Peças na mesa"), "2");
  await user.type(screen.getByLabelText("Nome da peça"), "Chaveiro coração");
  expect(screen.getByLabelText("Preço")).toHaveDisplayValue(/^Venda direta \(consumidor final\) · R\$\s52,50$/);
  await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));
  await user.selectOptions(screen.getByLabelText("Preço"), "Shopee");
  await user.click(screen.getByRole("button", { name: "Adicionar ao orçamento" }));

  const d = peekQuoteDraft()!;
  expect(d.channel).toBe("Consumidor final");
  expect(d.items).toHaveLength(2);
  expect(d.items[0]).toEqual({ productId: null, description: "Chaveiro coração", qty: 2, unitPrice: 52.5, discountPct: 0, unitCost: 10.5, printMinutes: 60 });
  expect(d.items[1]).toMatchObject({ description: "Chaveiro coração", unitPrice: 29, unitCost: 10.5, printMinutes: 60 }); // Shopee (10,50 + 4) ÷ 0,5; o nome fica
  await user.click(screen.getByRole("button", { name: /2 itens no orçamento em rascunho · Abrir/ }));
  expect(go).toHaveBeenCalledWith("quotes");
  expect(peekOpenQuoteDraft()).toBe(true);
});

describe("lucro por hora (#30) e testar um preço no Rápido (#37)", () => {
  beforeEach(async () => {
    localStorage.removeItem("upvision:calculadora");
    await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"failurePct":0,"targetProfitPerHour":10,"channels":[{"name":"Shopee","feePct":20,"feeFixed":4}]}')`);
  });

  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await screen.findAllByRole("option", { name: /^Shopee/ }); // preferências carregadas
    await user.type(screen.getByLabelText("Preço por kg"), "100");
    await user.type(screen.getByLabelText("Gramas"), "100"); // custo R$ 10
    await user.type(screen.getByLabelText("Tempo de impressão"), "2h");
  }

  test("tabela de canais: lucro por hora com selo da meta e preço pela meta", async () => {
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Rápido" })).toBeInTheDocument());
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));
    const row = (name: RegExp) => within(screen.getByRole("row", { name })).getAllByRole("cell").map((c) => c.textContent!.replace(/\u00a0/g, " "));
    // direto: 50 − 10 = 40 de lucro em 2 h = 20/h (meta 10) → na meta; preço pela meta = 10 + 10 × 2 = 30
    expect(row(/^Venda direta/)[5]).toBe("R$ 20,00/h na meta");
    expect(row(/^Venda direta/)[6]).toBe("R$ 30,00");
    // Shopee: (10 + 4) ÷ 0,5 = 28 → lucro 28 − 9,60 − 10 = 8,40 em 2 h = 4,20/h → menos da metade da meta
    expect(row(/^Shopee/)[5]).toBe("R$ 4,20/h menos da metade da meta");
    expect(row(/^Shopee/)[6]).toBe("R$ 42,50"); // (10 + 20 + 4) ÷ 0,8
  });

  test("Rápido: 'Vou vender por' mostra lucro, margem, lucro/h e selo; o valor segue para o Completo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Calculator go={() => {}} />);
    await fill(user);
    await user.type(screen.getByLabelText("Vou vender por"), "20");
    const out = () => screen.getByText(/^Lucro -?R\$/).textContent!.replace(/\u00a0/g, " ");
    expect(out()).toBe("Lucro R$ 10,00 · margem 50% · R$ 5,00/h abaixo da meta ok");
    await user.selectOptions(screen.getByLabelText("Onde"), "Shopee");
    expect(out()).toBe("Lucro R$ 2,00 · margem 10% · R$ 1,00/h menos da metade da meta ok"); // 20 − (4 + 4) − 10
    await user.clear(screen.getByLabelText("Vou vender por"));
    await user.type(screen.getByLabelText("Vou vender por"), "15");
    expect(out()).toBe("Lucro -R$ 2,00 · margem -13,3% · -R$ 1,00/h menos da metade da meta prejuízo"); // 15 − 7 − 10
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(screen.getByLabelText("Testar um preço (seu ou do concorrente)")).toHaveValue("15,00");
  });
});

test("canal com frete obrigatório acima de um preço (#31): o preço inclui o frete e a linha avisa", async () => {
  localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} }));
  await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"failurePct":0,"channels":[{"name":"ML","feePct":20,"feeFixed":0,"freeShippingAbove":100,"shippingCost":20}]}')`);
  const user = userEvent.setup();
  renderWithApp(<Calculator go={() => {}} />);
  await screen.findAllByRole("option", { name: /^ML/ });
  await user.type(screen.getByLabelText("Preço por kg"), "100");
  await user.type(screen.getByLabelText("Gramas"), "600"); // custo 60 → (60 + 20) ÷ 0,5 = 160
  const ml = screen.getByRole("row", { name: /^ML/ });
  expect(ml).toHaveTextContent(brl("160,00"));
  expect(ml).toHaveTextContent("frete obrigatório neste preço");
});

test("preço por quantidade (#32): preparo diluído, desconto em relação a 1 unidade e 'Usar no orçamento'", async () => {
  localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} }));
  clearQuoteDraft();
  await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"failurePct":0,"laborHourCost":30,"channels":[]}')`);
  const user = userEvent.setup();
  renderWithApp(<Calculator go={() => {}} />);
  await screen.findByText(/Venda direta \(consumidor final\) ×5/);
  await user.type(screen.getByLabelText("Preço por kg"), "100");
  await user.type(screen.getByLabelText("Gramas"), "20"); // custo R$ 2 por peça → R$ 10 direto
  await user.type(screen.getByLabelText("Tempo de impressão"), "30 min");
  await user.type(screen.getByLabelText("Nome da peça"), "Lembrancinha");
  await user.type(screen.getByLabelText("Preparo por pedido"), "20"); // 20 min × R$ 30/h = R$ 10
  const cells = (q: string) => within(screen.getByRole("row", { name: new RegExp(`^${q} R`) })).getAllByRole("cell").map((c) => c.textContent!.replace(/\u00a0/g, " "));
  expect(cells("1").slice(0, 4)).toEqual(["1", "R$ 12,00", "R$ 20,00", "—"]); // 10 + preparo 10
  expect(cells("10").slice(0, 4)).toEqual(["10", "R$ 3,00", "R$ 11,00", "45%"]);
  await user.click(screen.getByRole("button", { name: "Usar 50 unidades no orçamento" }));
  expect(peekQuoteDraft()!.items[0]).toEqual({ productId: null, description: "Lembrancinha", qty: 50, unitPrice: 10.2, discountPct: 0, unitCost: 2.2, printMinutes: 30 });
  expect(screen.getByRole("button", { name: /1 item no orçamento em rascunho/ })).toBeInTheDocument();
});

test("anúncios pagos (#29): ROAS de equilíbrio, frase e preço com anúncio; ROAS baixo demais avisa", async () => {
  localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} }));
  await t.db.execute(`INSERT OR REPLACE INTO settings (id, data) VALUES (1, '{"failurePct":0,"channels":[{"name":"Shopee","feePct":20,"feeFixed":4}]}')`);
  const user = userEvent.setup();
  renderWithApp(<Calculator go={() => {}} />);
  await screen.findAllByRole("option", { name: /^Shopee/ });
  await user.type(screen.getByLabelText("Preço por kg"), "100");
  await user.type(screen.getByLabelText("Gramas"), "100"); // custo 10 → Shopee (10 + 4) ÷ 0,5 = 28, lucro 8,40
  await user.click(screen.getByText("Anúncios pagos"));
  expect(screen.getByText("Com ROAS 5, de cada R$ 100 vendidos, R$ 20 vão para o anúncio.")).toBeInTheDocument();
  const ads = screen.getByText("Anúncios pagos").closest("details")!;
  const shopee = within(within(ads).getByRole("row", { name: /^Shopee/ })).getAllByRole("cell").map((c) => c.textContent!.replace(/\u00a0/g, " "));
  expect(shopee).toEqual(["Shopee", "3,33", "30%", "R$ 5,60", "R$ 2,80 ", "R$ 46,67"]); // (10 + 4) ÷ (1 − 0,2 − 0,3 − 0,2)
  const roas = within(ads).getByLabelText("ROAS esperado");
  await user.clear(roas);
  await user.type(roas, "2");
  expect(within(ads).getByRole("row", { name: /^Shopee/ })).toHaveTextContent("com este ROAS não há preço possível");
});
