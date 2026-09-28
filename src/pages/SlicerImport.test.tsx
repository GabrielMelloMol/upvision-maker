// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { Filament, Printer } from "../domain/entities";
import SlicerImport, { type SlicerApply } from "./SlicerImport";

const fixture = (name: string) => new File([readFileSync(resolve(__dirname, "../../tests/fixtures/slicer", name))], name);
const A1: Printer = { id: 7, name: "A1", watts: 110 };
const AZUL: Filament = { id: 1, material: "PLA", color: "Azul", brand: "Bambu", pricePerKg: 120, spoolG: 1000, stockG: 800, minG: 200 };
const BRANCO: Filament = { id: 2, material: "PLA", color: "Branco", brand: "Bambu", pricePerKg: 110, spoolG: 1000, stockG: 900, minG: 200 };

const upload = (file: File) => userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);

describe("Importar do fatiador", () => {
  test("3MF fatiado do Bambu: casa filamentos e impressora e preenche a calculadora; trocar o filamento reaplica", async () => {
    const onApply = vi.fn<(a: SlicerApply) => void>();
    render(<SlicerImport stock={[AZUL, BRANCO]} printers={[A1]} onApply={onApply} />);
    await upload(fixture("bambu-a1-2cores-fatiado.3mf"));
    expect(await screen.findByText(/Lido de/)).toBeInTheDocument();
    expect(screen.getByText("bambu-a1-2cores-fatiado.3mf")).toBeInTheDocument(); // rótulo da área vira o nome do arquivo
    expect(screen.getByText("Bambu Lab A1")).toBeInTheDocument();
    expect(screen.getByText("21 min")).toBeInTheDocument();
    expect(screen.queryByText(/não cadastrada/)).not.toBeInTheDocument();
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    const first = onApply.mock.lastCall![0];
    expect(first).toMatchObject({ printerId: 7, printerWatts: 110, pieces: 3 });
    expect(first.filaments.map((f) => [f.filamentId, f.pricePerKg, f.grams])).toEqual([
      [1, 120, 3.79],
      [2, 110, 0.55],
    ]);

    const second = screen.getByLabelText("Filamento cadastrado para o filamento 2");
    expect(second).toHaveValue("2");
    await userEvent.selectOptions(second, "PLA · Azul · Bambu");
    await waitFor(() => expect(onApply.mock.lastCall![0].filaments[1]).toEqual({ filamentId: 1, pricePerKg: 120, grams: 0.55 }));
    await userEvent.selectOptions(second, "Nenhum (digitar preço)");
    await waitFor(() => expect(onApply.mock.lastCall![0].filaments[1]).toEqual({ filamentId: null, pricePerKg: null, grams: 0.55 }));
  });

  test("impressora não cadastrada avisa que a potência fica em branco; cadastro que chega depois é casado", async () => {
    const onApply = vi.fn<(a: SlicerApply) => void>();
    const { rerender } = render(<SlicerImport stock={[]} printers={[]} onApply={onApply} />);
    await upload(fixture("bambu-a1-2cores-fatiado.3mf"));
    expect(await screen.findByText(/não cadastrada: potência não preenchida/)).toBeInTheDocument();
    await waitFor(() => expect(onApply.mock.lastCall![0]).toMatchObject({ printerId: null, printerWatts: null }));
    expect(onApply.mock.lastCall![0].filaments.every((f) => f.filamentId === null)).toBe(true);

    rerender(<SlicerImport stock={[AZUL, BRANCO]} printers={[A1]} onApply={onApply} />);
    await waitFor(() => expect(onApply.mock.lastCall![0]).toMatchObject({ printerId: 7, printerWatts: 110 }));
    expect(onApply.mock.lastCall![0].filaments[0].filamentId).toBe(1);
  });

  test("G-code do Cura (arrastado) mostra o que foi lido", async () => {
    const onApply = vi.fn<(a: SlicerApply) => void>();
    render(<SlicerImport stock={[AZUL]} printers={[A1]} onApply={onApply} />);
    fireEvent.drop(screen.getByRole("button", { name: /Arraste/ }), { dataTransfer: { files: [fixture("cura-1cor.gcode")] } });
    expect(await screen.findByText(/Lido de/)).toBeInTheDocument();
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.lastCall![0].filaments).toHaveLength(1);
    expect(onApply.mock.lastCall![0].seconds).toBeGreaterThan(0);
  });

  test("3MF sem fatiar explica o que fazer e não preenche nada", async () => {
    const onApply = vi.fn();
    render(<SlicerImport stock={[AZUL]} printers={[A1]} onApply={onApply} />);
    await upload(fixture("projeto-nao-fatiado.3mf"));
    expect(await screen.findByText(/ainda não foi fatiado/)).toBeInTheDocument();
    expect(screen.queryByText(/Lido de/)).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  test("arquivo que não é do fatiador vira erro", async () => {
    render(<SlicerImport stock={[]} printers={[]} onApply={vi.fn()} />);
    fireEvent.drop(screen.getByRole("button", { name: /Arraste/ }), { dataTransfer: { files: [new File(["oi"], "foto.txt")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use um arquivo 3MF, G-code ou G-code binário (.bgcode) do fatiador.");
  });
});
