// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, test, vi } from "vitest";
import { boxStl } from "../test/boxStl";
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

describe("camadas (#320)", () => {
  const strokesIn = (c: HTMLElement) => c.querySelectorAll(".plot-preview polyline").length;

  test("texto + forma juntos; esconder tira da prévia e do G-code; apagar some da lista", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    await waitFor(() => expect(strokesIn(container)).toBeGreaterThan(3));
    const onlyText = strokesIn(container);
    await user.click(screen.getByRole("button", { name: "Forma" }));
    await waitFor(() => expect(strokesIn(container)).toBe(onlyText + 1));
    await user.selectOptions(screen.getByLabelText("Forma"), "star");
    const list = screen.getByRole("list", { name: "Camadas" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByRole("button", { name: "Estrela" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Esconder Estrela" }));
    await waitFor(() => expect(strokesIn(container)).toBe(onlyText));
    await user.click(screen.getByRole("button", { name: "Apagar Estrela" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });

  test("lugar e giro mudam o G-code; espelhar e soltar motores entram no arquivo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await waitFor(() => expect(strokesIn(container)).toBe(1));
    const x = screen.getByLabelText(/^X do meio/);
    await user.clear(x);
    await user.type(x, "100");
    await user.click(screen.getByText(/Ver o G-code/));
    const g = () => (screen.getByLabelText("G-code") as HTMLTextAreaElement).value;
    // placa de 40 × 20 com o meio em X 100: canto em X 80
    await waitFor(() => expect(g()).toMatch(/G0 X80\.00 Y/));
    await user.click(screen.getByLabelText("Espelhar na horizontal"));
    await waitFor(() => expect(g()).toMatch(/G0 X176\.00 Y/)); // 256 − 80
    await user.click(screen.getByLabelText("Soltar os motores no fim"));
    await waitFor(() => expect(g()).toContain("M84"));
    const turn = screen.getByLabelText(/^Giro/);
    await user.clear(turn);
    await user.type(turn, "90");
    await waitFor(() => expect(g()).not.toMatch(/G0 X176\.00 Y/));
  });

  test("peça 3D (.stl) vira o contorno visto de cima; simulação anda traço a traço", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([boxStl(30, 12, 8)], "bloco.stl"));
    await waitFor(() => expect(strokesIn(container)).toBe(1));
    expect(screen.getByRole("heading", { name: "bloco" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próximo traço" }));
    expect(await screen.findByText(/Traço 1 de 1/)).toBeInTheDocument();
  });

  test("perfil: salva caneta + folha num arquivo e abre de volta", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<PenPlot />);
    const side = screen.getByLabelText(/^Distância para o lado/);
    await user.clear(side);
    await user.type(side, "33");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(await screen.findByText("Perfil salvo em /saida/perfil-caneta.json")).toBeInTheDocument();
    const saved = text("/saida/perfil-caneta.json");
    await user.clear(side);
    await user.type(side, "0");
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    await user.upload(inputs[inputs.length - 1], new File([saved], "perfil-caneta.json", { type: "application/json" }));
    expect(await screen.findByText("Perfil aberto.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Distância para o lado/)).toHaveValue(33);
    await user.upload(inputs[inputs.length - 1], new File(["{}"], "outro.json", { type: "application/json" }));
    expect(await screen.findByText(/não é um perfil da caneta/)).toBeInTheDocument();
  });
});
