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
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    const a1 = within(sheet).getByRole("option", { name: /^A1 95 W · dado oficial/ });
    await user.click(a1);
    expect(screen.queryByRole("dialog", { name: "Catálogo de impressoras" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Bambu Lab A1");
    expect(screen.getByLabelText(/^Potência/)).toHaveValue("95");
    expect(await screen.findByText("Preenchido com o catálogo — confira os valores.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(await screen.findByRole("row", { name: /Bambu Lab A1/ })).toBeInTheDocument();
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu Lab A1", watts: 95 }]);
  });

  test("busca filtra mantendo a marca; setas + Enter escolhem; estimativa marcada", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.type(within(sheet).getByRole("combobox", { name: "Buscar no catálogo" }), "creality k1");
    const opts = within(sheet).getAllByRole("option");
    expect(opts.map((o) => o.querySelector(".t")!.textContent)).toEqual(["K1", "K1C", "K1 Max"]);
    expect(within(sheet).getByText("Creality")).toHaveClass("palette-group");
    expect(opts[0]).toHaveTextContent("≈120 W · estimativa");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Creality K1C");
  });

  test("nada encontrado: 'Cadastrar à mão' fecha e volta ao formulário", async () => {
    const user = userEvent.setup();
    renderWithApp(<Printers />);
    await user.click(await screen.findByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.type(within(sheet).getByRole("combobox"), "impressora caseira");
    expect(within(sheet).getByText("Nada encontrado — digite do seu jeito")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar à mão" }));
    expect(screen.queryByRole("dialog", { name: "Catálogo de impressoras" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("");
  });
});
