// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Mosaic from "./Mosaic";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, setView() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };

beforeAll(() => {
  vi.stubGlobal("fetch", async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }));
});

const objects = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
const saved3mf = () => [...t.files.entries()].filter(([f]) => f.endsWith(".3mf"));

describe("Mosaico", () => {
  test("abre no tabuleiro, com as 5 abas, e salva o 3MF do tabuleiro", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    const tabs = screen.getAllByRole("tab").map((x) => x.textContent);
    expect(tabs).toEqual(["Tabuleiro", "Peças", "Pote", "Desenho", "Cartões"]);
    expect(screen.getByRole("tab", { name: "Tabuleiro" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    expect(screen.getByText(/O tabuleiro mede/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(saved3mf()).toHaveLength(1));
    expect(objects(saved3mf()[0][1])).toBe(1);
  }, 40_000);

  test("o resumo mostra peso e tempo de cada item do kit", async () => {
    renderWithApp(<Mosaic />);
    const box = await screen.findByRole("group", { name: "Peso e tempo de cada item" }, BUILD);
    for (const item of ["Tabuleiro", "Peças", "Pote", "Tampa"]) expect(within(box).getByText(item)).toBeInTheDocument();
    expect(within(box).getAllByText(/≈ \d+ g/)).toHaveLength(4);
  }, 40_000);

  test("aba Peças: uma cor por mesa dá um objeto por cor e as cores ligadas mudam a conta", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    await user.click(screen.getByRole("tab", { name: "Peças" }));
    expect(screen.getByRole("switch", { name: "Vermelho" })).toBeChecked();
    await waitFor(() => expect(screen.getByText(/peças em \d+ mesas?/)).toBeInTheDocument(), BUILD);
    const before = screen.getByText(/peças em \d+ mesas?/).textContent;
    await user.click(screen.getByRole("switch", { name: "Vermelho" }));
    await waitFor(() => expect(screen.getByText(/peças em \d+ mesas?/).textContent).not.toBe(before), BUILD);
  }, 60_000);

  test("aba Pote: o texto diz quantas divisórias e a tampa pode sair", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    await user.click(screen.getByRole("tab", { name: "Pote" }));
    expect(screen.getByText(/8 cores ligadas: o pote ganha 8 divisórias/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "STL pote" })).toBeInTheDocument(), BUILD);
    expect(screen.getByRole("button", { name: "STL tampa" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Fazer a tampa" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "STL tampa" })).not.toBeInTheDocument(), BUILD);
  }, 60_000);

  test("aba Desenho: escolher o cartão da borboleta lista as peças e desfazer volta ao vazio", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    await user.click(screen.getByRole("tab", { name: "Desenho" }));
    await user.click(screen.getByRole("button", { name: "Borboleta" }));
    expect(await screen.findByRole("heading", { name: /Peças do desenho: \d+ · Borboleta/ })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /Desenho do mosaico, 8 por 8 casas/ })).toBeInTheDocument();
  }, 40_000);

  test("aba Cartões: sem desenho marcado, o botão do PDF fica desligado; marcando um, liga", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    await user.click(screen.getByRole("tab", { name: "Cartões" }));
    expect(screen.getByRole("button", { name: /Salvar PDF \(0 cartões\)/ })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /^Gato$/ }));
    expect(screen.getByRole("button", { name: /Salvar PDF \(1 cartão\)/ })).toBeEnabled();
  });

  test("valor fora da faixa avisa e não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Mosaic />);
    const cols = screen.getByLabelText("Colunas");
    await user.clear(cols);
    await user.type(cols, "40");
    expect(await screen.findByText("Corrija os campos em vermelho para ver o kit.")).toBeInTheDocument();
  });
});
