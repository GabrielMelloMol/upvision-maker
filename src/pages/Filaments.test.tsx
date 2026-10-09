// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Filaments from "./Filaments";
import { rowAction } from "../test/rowMenu";

const t = setupTauri();

describe("Filamentos: catálogo e duplicar (#3)", () => {
  test("escolher do catálogo preenche marca, material e rolo; cor e preço ficam para ela", async () => {
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Adicionar filamento" }));
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de filamentos" });
    await user.type(within(sheet).getByRole("combobox"), "voolt petg");
    expect(within(sheet).getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Material")).toHaveValue("PETG");
    expect(screen.getByLabelText(/^Marca/)).toHaveValue("Voolt3D");
    expect(screen.getByLabelText(/^Peso do rolo/)).toHaveValue("1000");
  });

  test("duplicar: mesmo material, marca e preço, cor em branco, como cadastro novo", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Voolt3D', 119.9, 1000, 300, 200)");
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await rowAction(user, "PLA", "Duplicar");
    expect(screen.getByRole("heading", { name: "Adicionar filamento" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Marca/)).toHaveValue("Voolt3D");
    expect(screen.getByLabelText("Preço por kg")).toHaveValue("119,90");
    await user.click(screen.getByRole("radio", { name: "Vermelho" }));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(async () =>
      expect(await t.db.select("SELECT color, brand, pricePerKg, stockG FROM filaments ORDER BY id")).toEqual([
        { color: "Azul", brand: "Voolt3D", pricePerKg: 119.9, stockG: 300 },
        { color: "Vermelho", brand: "Voolt3D", pricePerKg: 119.9, stockG: 1000 },
      ]),
    );
  });
});

describe("Filamentos: TD fica em Opções avançadas (UX M1)", () => {
  const advanced = () => screen.getByText("Opções avançadas").closest("details")!;

  test("no cadastro novo o TD fica numa seção fechada, com a explicação em português", async () => {
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Adicionar filamento" }));
    await screen.findByRole("heading", { name: "Adicionar filamento" });
    expect(advanced().open).toBe(false);
    expect(within(advanced()).getByLabelText(/^TD/)).toBeInTheDocument();
    expect(screen.getByText(/HueForge/)).toBeInTheDocument();
    expect(screen.queryByText(/Transmission distance/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("TD (mm)")).not.toBeInTheDocument(); // o rótulo seco foi trocado
  });

  test("editar um filamento que já tem TD abre a seção sozinha; sem TD ela continua fechada", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG, td) VALUES ('PLA', 'Branco', 'A', 100, 1000, 500, 200, 0.8), ('PLA', 'Preto', 'B', 100, 1000, 500, 200, NULL)");
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await rowAction(user, /./, "Editar", undefined, 0); // na ordem do cadastro: Branco (com TD), Preto (sem)
    await waitFor(() => expect(advanced().open).toBe(true));
    expect(within(advanced()).getByLabelText(/^TD/)).toHaveValue("0.8");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await rowAction(user, /./, "Editar", undefined, 1);
    await waitFor(() => expect(advanced().open).toBe(false));
  });

  test("TD continua sendo gravado (campo opcional, número) mesmo dentro da seção", async () => {
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Adicionar filamento" }));
    await screen.findByRole("heading", { name: "Adicionar filamento" });
    await user.type(screen.getByLabelText(/^Marca/), "Voolt");
    await user.type(screen.getByLabelText("Preço por kg"), "100");
    await user.click(screen.getByRole("radio", { name: "Branco" }));
    await user.type(within(advanced()).getByLabelText(/^TD/), "0,6");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(async () => expect(await t.db.select("SELECT brand, td FROM filaments")).toEqual([{ brand: "Voolt", td: 0.6 }]));
  });
});

describe("M15: erro do banco nas telas de cadastro", () => {
  test("lista que não lê mostra 'Não foi possível ler os dados' e não 'Nada cadastrado ainda'", async () => {
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("banco travado");
    };
    renderWithApp(<Filaments />);
    expect(await screen.findByText(/Não foi possível ler os dados: banco travado/)).toBeInTheDocument();
    expect(screen.queryByText("Nada cadastrado ainda.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
