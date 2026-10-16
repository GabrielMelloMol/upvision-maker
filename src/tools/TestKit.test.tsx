// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { loadSettings } from "../db/repo";
import { setFits, validatedFit } from "../geometry/fits";
import { renderWithApp, setupTauri } from "../test/harness";
import TestKit from "./TestKit";

// o visualizador de verdade precisa de WebGL
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => null }) }));

const t = setupTauri();
beforeAll(() => void t);
afterEach(() => setFits(null));

describe("Kit de testes físicos (#247)", { timeout: 120_000 }, () => {
  test("mostra as peças, as medidas do caso e os avisos de TPU e PETG", async () => {
    renderWithApp(<TestKit />);
    expect(screen.getByRole("heading", { name: "Kit de testes" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Anel do copo/ })).toBeChecked();
    expect(screen.getByLabelText(/Diâmetro do copo na altura da alça/)).toHaveValue(75);
    expect(await screen.findByText(/O kit tem 41 peças em \d+ mesas/, {}, { timeout: 60_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mesa 1" })).toBeInTheDocument();
    expect(screen.getByText(/Mesa 1 · PLA ou PETG/)).toBeInTheDocument();
    expect(screen.getAllByText(/TPU 95A/).length).toBeGreaterThan(0);
  }, 100_000);

  test("desmarcar uma peça tira as medidas dela; sem nenhuma peça pede para marcar", async () => {
    renderWithApp(<TestKit />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: /Anel do copo/ }));
    expect(screen.queryByLabelText(/Diâmetro do copo na altura da alça/)).not.toBeInTheDocument();
    for (const sw of screen.getAllByRole("switch")) if (sw.getAttribute("aria-checked") === "true" || (sw as HTMLInputElement).checked) await user.click(sw);
    expect(await screen.findByText("Marque ao menos uma peça.")).toBeInTheDocument();
  });

  test("lançar o resultado: o número escolhido vira a folga padrão, grava nas Preferências e 'Ainda não testei' volta ao padrão", async () => {
    renderWithApp(<TestKit />);
    const user = userEvent.setup();
    const select = await screen.findByLabelText("Peça escolhida: Folga da rosca");
    expect(within(select).getAllByRole("option")).toHaveLength(6); // ainda não testei + 5 números
    await user.selectOptions(select, "4");
    await waitFor(() => expect(validatedFit("threadClearance")).toBe(0.4));
    expect((await loadSettings(t.db)).fits).toEqual({ threadClearance: 0.4 });
    expect(await screen.findByText(/em uso: 0,40 mm \(o padrão era 0,35\)/)).toBeInTheDocument();
    expect(screen.getByText(/Já vale em: Estojo com tampa de rosca/)).toBeInTheDocument();
    await user.selectOptions(select, "");
    await waitFor(() => expect(validatedFit("threadClearance")).toBeUndefined());
    expect((await loadSettings(t.db)).fits).toEqual({});
  });
});
