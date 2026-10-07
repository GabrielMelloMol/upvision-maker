// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { Filament } from "../../domain/entities";
import { renderWithApp, setupTauri } from "../../test/harness";
import { ToastProvider } from "../../ui/Toast";
import SlicerImport, { type SlicerApply } from "../SlicerImport";

const t = setupTauri();
const fixture = (name: string) => new File([readFileSync(resolve(__dirname, "../../../tests/fixtures/slicer", name))], name);
const BRANCO: Filament = { id: 2, material: "PLA", color: "Branco", brand: "Bambu", pricePerKg: 110, spoolG: 1000, stockG: 900, minG: 200 };

describe("Cadastrar filamento a partir do arquivo (#3)", () => {
  test("cor sem par no cadastro: oferece cadastrar com material e cor preenchidos; ao salvar, já usa o novo", async () => {
    const onApply = vi.fn<(a: SlicerApply) => void>();
    const onStockAdded = vi.fn();
    const user = userEvent.setup();
    const { rerender } = renderWithApp(<SlicerImport stock={[BRANCO]} printers={[]} onApply={onApply} onStockAdded={onStockAdded} />);
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("bambu-a1-2cores-fatiado.3mf"));
    expect(await screen.findByText(/Lido de/)).toBeInTheDocument();

    // filamento 1 é azul (só há branco cadastrado): oferece cadastro; o 2 é branco: não oferece
    expect(screen.queryByRole("button", { name: "Cadastrar o filamento 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cadastrar o filamento 1" }));
    const sheet = await screen.findByRole("dialog", { name: "Cadastrar este filamento" });
    expect(within(sheet).getByLabelText("Material")).toHaveValue("PLA");
    expect(within(sheet).getByRole("radio", { name: "Azul" })).toBeChecked();

    await user.click(within(sheet).getByRole("button", { name: "Cadastrar e usar" }));
    expect(await within(sheet).findByText("Digite um número.")).toBeInTheDocument(); // falta o preço
    await user.type(within(sheet).getByLabelText("Preço por kg"), "129,90");
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar e usar" }));

    await waitFor(() => expect(onStockAdded).toHaveBeenCalled());
    const rows = await t.db.select<Filament>("SELECT * FROM filaments");
    expect(rows).toMatchObject([{ material: "PLA", color: "Azul", pricePerKg: 129.9, stockG: 1000 }]);
    // o pai recarrega o estoque: a linha 1 passa a usar o filamento novo
    rerender(
      <ToastProvider>
        <SlicerImport stock={[BRANCO, rows[0]]} printers={[]} onApply={onApply} onStockAdded={onStockAdded} />
      </ToastProvider>,
    );
    await waitFor(() => expect(onApply.mock.lastCall![0].filaments[0]).toMatchObject({ filamentId: rows[0].id, pricePerKg: 129.9 }));
    expect(screen.queryByRole("button", { name: "Cadastrar o filamento 1" })).not.toBeInTheDocument();
  });

  test("B11: banco que falha ao cadastrar mostra o erro na janela, em vez de não acontecer nada", async () => {
    const user = userEvent.setup();
    renderWithApp(<SlicerImport stock={[BRANCO]} printers={[]} onApply={vi.fn()} onStockAdded={vi.fn()} />);
    await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("bambu-a1-2cores-fatiado.3mf"));
    await user.click(await screen.findByRole("button", { name: "Cadastrar o filamento 1" }));
    const sheet = await screen.findByRole("dialog", { name: "Cadastrar este filamento" });
    await user.type(within(sheet).getByLabelText("Preço por kg"), "129,90");
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("banco travado");
    };
    await user.click(within(sheet).getByRole("button", { name: "Cadastrar e usar" }));
    expect(await within(sheet).findByText(/banco travado/)).toBeInTheDocument();
    expect(await t.db.select("SELECT id FROM filaments")).toEqual([]);
  });
});
