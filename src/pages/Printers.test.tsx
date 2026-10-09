// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Printers from "./Printers";

const t = setupTauri();

describe("Impressoras: catálogo (#1)", () => {
  test("Bambu Lab A1 em 2 cliques, sem digitar número; fonte do dado na lista", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    const a1 = within(sheet).getByRole("option", { name: /^A1 95 W · dado oficial/ });
    await user.click(a1);
    expect(screen.queryByRole("dialog", { name: "Catálogo de impressoras" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Bambu Lab A1");
    expect(screen.getByLabelText(/^Potência/)).toHaveValue("95");
    expect(await screen.findByText("Preenchido com o catálogo — confira os valores.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("row", { name: /Bambu Lab A1/ })).toBeInTheDocument();
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu Lab A1", watts: 95 }]);
  });

  test("busca filtra mantendo a marca; setas + Enter escolhem; estimativa marcada", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.type(within(sheet).getByRole("combobox", { name: "Buscar no catálogo" }), "creality k1");
    const opts = within(sheet).getAllByRole("option");
    expect(opts.map((o) => o.querySelector(".t")!.textContent)).toEqual(["K1", "K1C", "K1 Max", "K1 SE"]);
    expect(within(sheet).getByText("Creality")).toHaveClass("palette-group");
    expect(opts[0]).toHaveTextContent("≈120 W · estimativa");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Creality K1C");
  });

  test("nada encontrado: 'Cadastrar à mão' fecha e volta ao formulário", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.type(within(sheet).getByRole("combobox"), "impressora caseira");
    expect(within(sheet).getByText("Nada encontrado — digite do seu jeito")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar à mão" }));
    expect(screen.queryByRole("dialog", { name: "Catálogo de impressoras" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("");
  });
});

test("preço e vida útil da impressora (#22): gravados, na tabela; desgaste só no formulário", async () => {
  const user = userEvent.setup();
  renderWithApp(<Printers />);
  await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
  await user.type(await screen.findByLabelText(/^Nome/), "A1");
  await user.type(screen.getByLabelText(/^Potência/), "95");
  await user.type(screen.getByLabelText(/^Preço pago/), "3000");
  expect(screen.getByLabelText(/^Vida útil/)).toHaveValue("5000");
  await user.click(screen.getByRole("button", { name: "Adicionar" }));
  const row = await screen.findByRole("row", { name: /A1/ });
  expect(row).toHaveTextContent("R$ 3.000,00");
  expect(screen.queryByRole("columnheader", { name: /Desgaste/ })).not.toBeInTheDocument();
  expect(await t.db.select("SELECT price, lifeHours, upkeepPerHour FROM printers")).toEqual([{ price: 3000, lifeHours: 5000, upkeepPerHour: 0 }]);
});

test("potência medida com tomada inteligente preenche o campo (#22)", async () => {
  const user = userEvent.setup();
  renderWithApp(<Printers />);
  await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
  await user.click(await screen.findByRole("button", { name: "Medir com tomada inteligente" }));
  const sheet = await screen.findByRole("dialog", { name: "Medir com tomada inteligente" });
  expect(within(sheet).getByText(/não o Power \(W\)/)).toBeInTheDocument();
  await user.type(within(sheet).getByLabelText("kWh no início"), "10");
  await user.type(within(sheet).getByLabelText("kWh no fim"), "10,05");
  await user.type(within(sheet).getByLabelText("Duração da impressão"), "30 min");
  expect(within(sheet).getByText(/menos de 1 hora/)).toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "Usar 100 W" }));
  expect(screen.getByLabelText(/^Potência/)).toHaveValue("100");
});

test("textos de Impressoras sem jargão solto: desgaste por hora e a placa PEI explicada (UX M1)", async () => {
  const user = userEvent.setup();
  renderWithApp(<Printers />);
  await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
  await screen.findByLabelText(/^Nome/);
  expect(screen.getByText("Com o preço, a calculadora cobra o desgaste por hora e ignora a % de manutenção.")).toBeInTheDocument();
  expect(screen.getByText("Peças que gastam: bico, placa de impressão (PEI), correias. Deixe 0 se não souber.")).toBeInTheDocument();
  expect(screen.queryByText(/depreciação/)).not.toBeInTheDocument();
});


describe("Impressoras: bico (mm)", () => {
  test("campo Bico (mm) com padrão 0,4 e atalhos 0,2 / 0,4 / 0,6 / 0,8; grava o bico escolhido ou digitado", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    const nozzle = screen.getByLabelText(/^Bico \(mm\)/);
    expect(nozzle).toHaveValue("0,4");
    const presets = within(screen.getByRole("group", { name: "Bicos comuns" }));
    expect(presets.getAllByRole("button").map((b) => b.textContent)).toEqual(["0,2 mm", "0,4 mm", "0,6 mm", "0,8 mm"]);
    expect(presets.getByRole("button", { name: "0,4 mm" })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText(/^Nome/), "Minha fina");
    await user.type(screen.getByLabelText(/^Potência/), "90");
    await user.click(presets.getByRole("button", { name: "0,2 mm" }));
    expect(nozzle).toHaveValue("0,2");
    expect(presets.getByRole("button", { name: "0,2 mm" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByRole("row", { name: /Minha fina/ })).toBeInTheDocument();
    expect(await t.db.select("SELECT name, nozzle FROM printers")).toEqual([{ name: "Minha fina", nozzle: 0.2 }]);

    // valor livre: 0,5 mm (um bico fora dos atalhos) e fora de 0,1 a 2 mm é recusado
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.type(screen.getByLabelText(/^Nome/), "Meio-termo");
    await user.type(screen.getByLabelText(/^Potência/), "100");
    await user.clear(screen.getByLabelText(/^Bico \(mm\)/));
    await user.type(screen.getByLabelText(/^Bico \(mm\)/), "5");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText(/O bico vai de 0,1 a 2 mm/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Bico \(mm\)/));
    await user.type(screen.getByLabelText(/^Bico \(mm\)/), "0,5");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await screen.findByRole("row", { name: /Meio-termo/ });
    expect(await t.db.select("SELECT name, nozzle FROM printers ORDER BY id")).toEqual([{ name: "Minha fina", nozzle: 0.2 }, { name: "Meio-termo", nozzle: 0.5 }]);
  });

  test("pelo catálogo: Bambu A1 vem com o bico de fábrica 0,4; marca sem o dado fica no padrão 0,4 sem inventar", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Adicionar impressora" }));
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.click(within(sheet).getByRole("option", { name: /^A1 95 W · dado oficial/ }));
    expect(screen.getByLabelText(/^Bico \(mm\)/)).toHaveValue("0,4");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await screen.findByRole("row", { name: /Bambu Lab A1/ });
    expect(await t.db.select("SELECT name, nozzle FROM printers")).toEqual([{ name: "Bambu Lab A1", nozzle: 0.4 }]);
  });

  test("a lista mostra o bico de cada impressora", async () => {
    await t.db.execute("INSERT INTO printers (name, watts, nozzle) VALUES ('Fina', 80, 0.2)");
    renderWithApp(<Printers />);
    const row = await screen.findByRole("row", { name: /Fina/ });
    expect(within(row).getByText("0,2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Bico (mm)" })).toBeInTheDocument();
  });
});
