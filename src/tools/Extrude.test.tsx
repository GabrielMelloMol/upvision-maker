// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Extrude from "./Extrude";
import { handoffSvg, peekHandoff } from "./handoff";

// happy-dom não tem WebGL: a cena 3D é trocada por um stub (viewerScene tem teste próprio).
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const RECT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="0 0 40 20"><rect x="0" y="0" width="40" height="20"/></svg>';
const svgFile = (name = "placa.svg") => new File([RECT_SVG], name, { type: "image/svg+xml" });
const BUILD = { timeout: 10_000 };
const legendColors = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.background);


describe("Extrusão SVG → 3D", () => {
  test("sem desenho: prévia vazia e botões de exportar desabilitados", () => {
    renderWithApp(<Extrude />);
    expect(screen.getByText("Envie um desenho para extrudar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  });

  test("SVG enviado: largura vem do SVG (mm), gera o modelo e salva 3MF e STL", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Extrude />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    expect(await screen.findByText("placa")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(40);
    expect(await screen.findByText(/40\.0 × 20\.0 × 2\.0 mm/, undefined, BUILD)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    expect(await screen.findByText("Arquivo salvo em /saida/placa.3mf")).toBeInTheDocument();
    expect([...t.files.get("/saida/placa.3mf")!.subarray(0, 2)]).toEqual([0x50, 0x4b]); // zip "PK"

    await user.click(screen.getByRole("button", { name: /Salvar STL/ }));
    await waitFor(() => expect(t.files.has("/saida/placa.stl")).toBe(true));
  });

  test("base por baixo: 2 cores (legenda) e altura soma a base", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Extrude />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await user.click(screen.getByRole("checkbox", { name: /Base por baixo/ }));
    expect(screen.getByText("Cor da base")).toBeInTheDocument();
    expect(await screen.findByText(/× 3\.6 mm/, undefined, BUILD)).toBeInTheDocument();
    expect(container.querySelectorAll(".legend span")).toHaveLength(2);
  });

  test("campo fora da faixa: não gera e pede correção", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Extrude />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, svgFile());
    await screen.findByText(/× 2\.0 mm/, undefined, BUILD);
    await user.clear(screen.getByLabelText(/^Altura do desenho/));
    await user.type(screen.getByLabelText(/^Altura do desenho/), "500");
    expect(await screen.findByText("Corrija os campos em vermelho.", undefined, BUILD)).toBeInTheDocument();
    expect(screen.getByText("Use entre 0,2 e 100.")).toBeInTheDocument();
  });

  test("SVG vindo de outra ferramenta (handoff) já abre carregado e é consumido", async () => {
    handoffSvg(RECT_SVG, "do-vetorizador");
    renderWithApp(<Extrude />);
    expect(screen.getByText("do-vetorizador")).toBeInTheDocument();
    expect(peekHandoff()).toBeNull();
    expect(await screen.findByText(/40\.0 × 20\.0/, undefined, BUILD)).toBeInTheDocument();
  });

  test("SVG inválido mostra o erro de leitura", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Extrude />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], "vazio.svg", { type: "image/svg+xml" }));
    expect(await screen.findByRole("alert", undefined, BUILD)).toBeInTheDocument();
  });

  test("cancelar o 'Salvar como' não grava nada", async () => {
    t.savePath = () => null;
    handoffSvg(RECT_SVG, "placa");
    const user = userEvent.setup();
    renderWithApp(<Extrude />);
    await screen.findByText(/× 2\.0 mm/, undefined, BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|save"));
    expect(t.files.size).toBe(0);
  });

  test("cores da base e do desenho vão para as partes do modelo", async () => {
    handoffSvg(RECT_SVG, "placa");
    const user = userEvent.setup();
    const { container } = renderWithApp(<Extrude />);
    await user.click(screen.getByRole("checkbox", { name: /Base por baixo/ }));
    const [base, top] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.input(base, { target: { value: "#ff0000" } });
    fireEvent.input(top, { target: { value: "#00ff00" } });
    await waitFor(() => expect(legendColors(container)).toEqual(["#ff0000", "#00ff00"]), BUILD);
  });
});
