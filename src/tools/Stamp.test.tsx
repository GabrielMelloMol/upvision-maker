// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Stamp from "./Stamp";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,0 13,7 20,7 14,12 16,20 10,15 4,20 6,12 0,7 7,7"/><rect x="2" y="2" width="1" height="0.1"/></svg>';

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const parts = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;

describe("Carimbo seco", () => {
  test("padrão: duas placas (sem a prévia do papel no arquivo); salva 3MF e STL de cada", async () => {
    const user = userEvent.setup();
    renderWithApp(<Stamp />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/carimbo-Ana-&-Bruno.3mf") || [...t.files.keys()].some((f) => f.startsWith("/saida/carimbo"))).toBe(true));
    const file = [...t.files.keys()].find((f) => f.endsWith(".3mf"))!;
    expect(parts(t.files.get(file)!)).toBe(2);
    expect(screen.getByRole("button", { name: "STL placa com relevo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "STL placa com cavidade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^STL .*papel/i })).not.toBeInTheDocument();
  }, 30_000);

  test("modelo Convite de casamento: selo redondo com textos em volta e ímãs", async () => {
    const user = userEvent.setup();
    renderWithApp(<Stamp />);
    await user.click(screen.getByRole("button", { name: "Convite de casamento" }));
    expect(screen.getByLabelText("Texto em cima, em volta")).toHaveValue("ANA & BRUNO");
    expect(screen.getByLabelText("Diâmetro (mm)")).toHaveValue(45);
    expect(screen.getByRole("button", { name: "Ímãs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Diâmetro do ímã (mm)")).toHaveValue(6);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
  }, 30_000);

  test("dobradiça: vira um objeto só e avisa para usar PETG", async () => {
    const user = userEvent.setup();
    renderWithApp(<Stamp />);
    await user.click(screen.getByRole("button", { name: "Dobradiça" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    expect(screen.getByText(/A dobradiça é um filme/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect([...t.files.keys()].some((f) => f.endsWith(".3mf"))).toBe(true));
    const file = [...t.files.keys()].find((f) => f.endsWith(".3mf"))!;
    expect(parts(t.files.get(file)!)).toBe(1);
  }, 30_000);

  test("logo SVG com traço de 0,1 mm: o app avisa e engrossa", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Stamp />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([LOGO], "estrela.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText("estrela.svg")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    expect(screen.queryByText("estrela.svg")).not.toBeInTheDocument();
  }, 30_000);

  test("sem texto nem logo: pede um desenho", async () => {
    const user = userEvent.setup();
    renderWithApp(<Stamp />);
    const box = screen.getByLabelText(/^Texto \(uma linha/);
    await user.clear(box);
    expect(await screen.findByText("Digite um texto ou envie um logo para ver o carimbo.")).toBeInTheDocument();
  });

  test("valor fora da faixa fica marcado e não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Stamp />);
    const w = screen.getByLabelText("Largura (mm)");
    await user.clear(w);
    await user.type(w, "500");
    expect(await screen.findByText("Corrija os campos em vermelho para ver o carimbo.")).toBeInTheDocument();
  });
});
