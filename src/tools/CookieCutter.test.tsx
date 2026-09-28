// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import CookieCutter from "./CookieCutter";
import { handoffSvg } from "./handoff";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const HEART = '<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60"><circle cx="30" cy="30" r="28"/></svg>';
const BUILD = { timeout: 15_000 };

describe("Cortador de biscoito", () => {
  test("sem desenho: pede um desenho", () => {
    renderWithApp(<CookieCutter />);
    expect(screen.getByText("Envie um desenho para ver o cortador.")).toBeInTheDocument();
  });

  test("gera cortador + carimbo (2 objetos, STL de cada) e avisa quando não há desenho interno", async () => {
    handoffSvg(HEART, "bola");
    const user = userEvent.setup();
    renderWithApp(<CookieCutter />);
    expect(screen.getByLabelText(/^Largura/)).toHaveValue(60);
    expect(await screen.findByText("Sem desenho interno para o carimbo marcar: ele sai liso.", undefined, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/Imprima o cortador com a borda na mesa/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "STL carimbo" }));
    await waitFor(() => expect(t.files.has("/saida/cortador-bola-carimbo.stl")).toBe(true));
    await user.click(screen.getByRole("button", { name: "STL cortador" }));
    await waitFor(() => expect(t.files.has("/saida/cortador-bola-cortador.stl")).toBe(true));
  });

  test("sem carimbo: um objeto só e as opções do carimbo somem", async () => {
    handoffSvg(HEART, "bola");
    const user = userEvent.setup();
    renderWithApp(<CookieCutter />);
    expect(screen.getByLabelText("O que marca na massa")).toHaveValue("auto");
    await user.selectOptions(screen.getByLabelText("O que marca na massa"), "holes");
    await user.click(screen.getByRole("checkbox", { name: /Carimbo do desenho interno/ }));
    expect(screen.queryByLabelText("O que marca na massa")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Salvar STL/ }, BUILD)).toBeEnabled();
    expect(screen.queryByText(/Sem desenho interno/)).not.toBeInTheDocument();
  });

  test("largura abaixo do mínimo: não gera e pede correção", async () => {
    handoffSvg(HEART, "bola");
    const user = userEvent.setup();
    renderWithApp(<CookieCutter />);
    await user.click(screen.getByRole("checkbox", { name: /Espelhar/ }));
    await user.clear(screen.getByLabelText(/^Largura/));
    await user.type(screen.getByLabelText(/^Largura/), "5");
    expect(await screen.findByText("Corrija os campos em vermelho para ver o cortador.", undefined, BUILD)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  });

  test("imagem que não abre mostra erro de leitura", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("bad")));
    const user = userEvent.setup();
    const { container } = renderWithApp(<CookieCutter />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByText(/Não consegui abrir esta imagem/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
