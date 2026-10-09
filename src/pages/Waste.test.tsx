// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { renderWithApp, setupTauri, type TauriState } from "../test/harness";
import Filaments from "./Filaments";

const t = setupTauri();

type Mv = { kind: "filament" | "material" | "product"; id: number; delta: number };
/** Mesmo contrato do comando Rust apply_stock, só os movimentos (sem pedido), sobre o SQLite do teste. */
function installApplyStock(s: TauriState) {
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  s.handlers["apply_stock"] = (a) => {
    for (const mv of a.movements as Mv[]) s.raw.prepare(`UPDATE ${col[mv.kind][0]} SET ${col[mv.kind][1]} = ${col[mv.kind][1]} + ? WHERE id = ?`).run(mv.delta, mv.id);
    return null;
  };
}
const seed = () =>
  t.raw.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":12}],"materials":[],"items":[]}', 1, 0, 15);`);
const stockG = () => (t.raw.prepare("SELECT stockG FROM filaments").get() as { stockG: number }).stockG;

describe("Amostra ou erro de impressão (#189)", () => {
  test("registra o erro de um produto: as gramas vêm da composição, baixa o filamento, guarda o custo e atualiza a lista", async () => {
    seed();
    installApplyStock(t);
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Amostra ou erro de impressão" }));
    const sheet = await screen.findByRole("dialog", { name: "Amostra ou erro de impressão" });
    await user.selectOptions(await within(sheet).findByLabelText("Produto (opcional)"), "Chaveiro");
    expect(within(sheet).getByLabelText("Gramas")).toHaveValue("12");
    const grams = within(sheet).getByLabelText("Gramas");
    await user.clear(grams);
    await user.type(grams, "50");
    expect(within(sheet).getByText(/Custo do material: R\$\s5,00/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Observações"), "descolou");
    await user.click(within(sheet).getByRole("button", { name: "Registrar e dar baixa" }));
    expect(await screen.findByText(/Erro de impressão registrado: R\$\s5,00 em material/)).toBeInTheDocument();
    expect(stockG()).toBe(950);
    expect(t.raw.prepare("SELECT kind, productId, cost, notes FROM waste_runs").get()).toEqual({ kind: "failure", productId: 1, cost: 5, notes: "descolou" });
    expect(await within(sheet).findByRole("row", { name: /Erro de impressão.*Chaveiro.*R\$\s5,00/ })).toBeInTheDocument();
  });

  test("amostra sem produto: escolhe o filamento à mão; excluir o registro devolve o estoque", async () => {
    seed();
    installApplyStock(t);
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Amostra ou erro de impressão" }));
    const sheet = await screen.findByRole("dialog", { name: "Amostra ou erro de impressão" });
    await user.selectOptions(within(sheet).getByLabelText("O que foi"), "Amostra ou teste");
    await user.click(within(sheet).getByRole("button", { name: "Adicionar filamento" }));
    await user.selectOptions(within(sheet).getByLabelText("Filamento"), "PLA · Azul · X");
    await user.type(within(sheet).getByLabelText("Gramas"), "20");
    await user.click(within(sheet).getByRole("button", { name: "Registrar e dar baixa" }));
    await waitFor(() => expect(stockG()).toBe(980));
    expect(t.raw.prepare("SELECT kind, cost FROM waste_runs").get()).toEqual({ kind: "sample", cost: 2 });
    await user.click(await within(sheet).findByRole("button", { name: /Excluir registro de/ }));
    await waitFor(() => expect(stockG()).toBe(1000));
    expect(t.raw.prepare("SELECT COUNT(*) AS n FROM waste_runs").get()).toEqual({ n: 0 });
  }, 20_000);

  test("sem filamento com gramas o botão de registrar fica desligado", async () => {
    seed();
    installApplyStock(t);
    const user = userEvent.setup();
    renderWithApp(<Filaments />);
    await user.click(await screen.findByRole("button", { name: "Amostra ou erro de impressão" }));
    const sheet = await screen.findByRole("dialog", { name: "Amostra ou erro de impressão" });
    expect(within(sheet).getByRole("button", { name: "Registrar e dar baixa" })).toBeDisabled();
  });
});
