// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Medal from "./Medal";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 15_000 };
const STAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,0 13,7 20,7 14,12 16,20 10,15 4,20 6,12 0,7 7,7"/></svg>';

// As fontes vêm por URL do Vite (/node_modules/...): no Node, lê do disco.
beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

describe("Medalhas", () => {
  test("padrão (redonda, texto CAMPEÃ): 50 mm com alça, base e destaque na legenda, salva 3MF", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    expect(await screen.findByText(/^50\.0 ×/, undefined, BUILD)).toBeInTheDocument();
    expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toEqual(["Base", "Destaque"]);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalha-campea.3mf")).toBe(true));
  });

  test("imagem no centro vira a 3ª cor; remover volta a 2", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([STAR_SVG], "estrela.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText("estrela.svg")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll(".legend span")).toHaveLength(3), BUILD);
    await user.click(screen.getByRole("button", { name: "Remover imagem" }));
    await waitFor(() => expect(container.querySelectorAll(".legend span")).toHaveLength(2), BUILD);
  });

  test("formato estrela, sem texto e sem alça: nome padrão no arquivo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    const shape = screen.getByRole("group", { name: "Formato" });
    await user.click(within(shape).getByRole("button", { name: "Estrela" }));
    expect(within(shape).getByRole("button", { name: "Estrela" })).toHaveAttribute("aria-pressed", "true");
    await user.clear(screen.getByLabelText(/Texto \(embaixo\)/));
    await user.clear(screen.getByLabelText(/^Largura da fita/));
    await user.type(screen.getByLabelText(/^Largura da fita/), "0");
    await user.selectOptions(screen.getByLabelText("Fonte"), "fredoka");
    await waitFor(() => expect(container.querySelector(".hud")?.textContent).toBe("50.0 × 47.6 × 4.0 mm"), BUILD); // estrela sem alça: mais baixa que larga
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalha-sem-texto.3mf")).toBe(true));
  }, 30_000);

  test("tamanho fora da faixa: não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Medal />);
    await user.clear(screen.getByLabelText(/^Tamanho/));
    await user.type(screen.getByLabelText(/^Tamanho/), "5");
    expect(await screen.findByText("Corrija os campos em vermelho.", undefined, BUILD)).toBeInTheDocument();
  });

  test("imagem inválida mostra erro", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("bad")));
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(/Não consegui abrir esta imagem/)).toBeInTheDocument();
  });

  test("cores de base, destaque e imagem vão para as partes", async () => {
    const { container } = renderWithApp(<Medal />);
    const [base, accent, art] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.input(base, { target: { value: "#ff0000" } });
    fireEvent.input(accent, { target: { value: "#00ff00" } });
    fireEvent.input(art, { target: { value: "#0000ff" } });
    await waitFor(() => expect([...container.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.background)).toEqual(["#ff0000", "#00ff00"]), BUILD);
  });
});
