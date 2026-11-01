// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
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

  test("SVG enviado: prévia na mesa e .gcode.3mf salvo como teste no ar (padrão); .gcode simples na outra opção", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(40);
    await user.click(screen.getByRole("button", { name: /Salvar G-code/ }));
    expect(await screen.findByText("G-code salvo em /saida/placa-teste-no-ar.gcode.3mf")).toBeInTheDocument();
    const g = strFromU8(unzipSync(t.files.get("/saida/placa-teste-no-ar.gcode.3mf")!)["Metadata/plate_1.gcode"]);
    expect(g).toContain("TESTE NO AR");
    expect(g).toContain("G28");
    await user.click(screen.getByRole("button", { name: ".gcode (outras)" }));
    await user.click(screen.getByRole("button", { name: /Salvar G-code/ }));
    expect(await screen.findByText("G-code salvo em /saida/placa-teste-no-ar.gcode")).toBeInTheDocument();
    expect(text("/saida/placa-teste-no-ar.gcode")).toBe(g);
  });

  test("preencher: a forma ganha linhas por dentro; caneta deslocada demais para o desenho dá erro", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Contorno + preencher" }));
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline").length).toBeGreaterThan(20));
    const w = screen.getByLabelText(/^Largura/);
    await user.clear(w);
    await user.type(w, "200");
    await user.click(screen.getByRole("button", { name: "Mesa toda" }));
    await user.click(screen.getByRole("button", { name: "À esquerda" }));
    const off = screen.getByLabelText(/^Distância para o lado/);
    await user.clear(off);
    await user.type(off, "60");
    expect(await screen.findByText(/não cabe na área que a caneta alcança/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
  });

  test("desenho alto que passa da folha: erro e nada para salvar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile(TALL_SVG));
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    const w = screen.getByLabelText(/^Largura/);
    await user.clear(w);
    await user.type(w, "200");
    expect(await screen.findByText(/não cabe na folha/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
  });

  test("altura ao desenhar fora do limite: mensagem e nada para salvar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
    const z = screen.getByLabelText(/^Altura ao desenhar/);
    await user.clear(z);
    await user.type(z, "9");
    expect(await screen.findByText(/no máximo 6 mm/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeDisabled();
  });

  test("texto: traço único por padrão; contorno de fonte na outra opção", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline").length).toBeGreaterThan(3), { timeout: 15_000 });
    expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Contorno de uma fonte" }));
    await waitFor(() => expect(screen.getByText(/caneta passa no contorno das letras/)).toBeInTheDocument());
    await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline").length).toBeGreaterThan(3), { timeout: 15_000 });
  });
});

test("caneta na frente do bico: a direção vira Y negativo; a folha aparece na prévia; simular troca o botão (#317)", async () => {
  const user = userEvent.setup();
  const { container } = renderWithApp(<PenPlot />);
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
  await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
  expect(screen.getByText(/Folha de 148 × 210 mm/)).toBeInTheDocument();
  await user.click(screen.getByLabelText("Folha deitada"));
  expect(await screen.findByText(/Folha de 210 × 148 mm/)).toBeInTheDocument();
  const d = screen.getByLabelText(/^Distância para a frente ou para trás/);
  await user.clear(d);
  await user.type(d, "30");
  expect(await screen.findByRole("img", { name: /30 mm para a frente do bico/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Atrás" }));
  expect(await screen.findByRole("img", { name: /30 mm para trás do bico/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "À esquerda" }));
  const side = screen.getByLabelText(/^Distância para o lado/);
  await user.clear(side);
  await user.type(side, "12");
  expect(await screen.findByRole("img", { name: /12 mm à esquerda/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Simular o desenho" }));
  expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
});
