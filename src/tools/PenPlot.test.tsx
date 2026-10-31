// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import PenPlot from "./PenPlot";

// a fonte vem do disco (no app o Vite entrega o arquivo)
vi.mock("../geometry/fonts", async (orig) => {
  const mod = await orig<typeof import("../geometry/fonts")>();
  const b = readFileSync("node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { ...mod, loadFont: async () => font };
});

const t = setupTauri();
const RECT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><rect x="0" y="0" width="40" height="20"/></svg>';
const svgFile = (svg = RECT_SVG) => new File([svg], "placa.svg", { type: "image/svg+xml" });
const TALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="40mm" viewBox="0 0 20 40"><rect x="0" y="0" width="20" height="40"/></svg>';
const text = (path: string) => new TextDecoder().decode(t.files.get(path)!);

describe("Desenhar com caneta", () => {
  test("sem desenho: Salvar G-code desabilitado e aviso de supervisionar", () => {
    renderWithApp(<PenPlot />);
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
    expect(screen.getByText(/Fique de olho na impressora/)).toBeInTheDocument();
  });

  test("SVG enviado: prévia na mesa e G-code salvo como teste no ar (padrão)", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(40);
    await user.click(screen.getByRole("button", { name: /Salvar G-code/ }));
    expect(await screen.findByText("G-code salvo em /saida/placa-teste-no-ar.gcode")).toBeInTheDocument();
    const g = text("/saida/placa-teste-no-ar.gcode");
    expect(g).toContain("TESTE NO AR");
    expect(g).toContain("G28");
  });

  test("desenho alto que passa da mesa: erro e nada para salvar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile(TALL_SVG));
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    const w = screen.getByLabelText(/^Largura/);
    await user.clear(w);
    await user.type(w, "200");
    expect(await screen.findByText(/não cabe na mesa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
  });

  test("altura ao subir abaixo da de desenhar: mensagem e nada para salvar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    const z = screen.getByLabelText(/^Altura ao desenhar/);
    await user.clear(z);
    await user.type(z, "9");
    expect(await screen.findByText(/pelo menos 1 mm acima/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
  });

  test("texto: as letras viram traços na mesa", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline").length).toBeGreaterThan(3), { timeout: 15_000 });
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeEnabled();
  });
});
