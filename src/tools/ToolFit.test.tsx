// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import ToolFit from "./ToolFit";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const saved = (name: string) => strFromU8(unzipSync(t.files.get(`/saida/${name}`)!)["3D/3dmodel.model"]);

describe("Organizador pela foto (#169)", () => {
  test("prévia 2D com a medida de cada ferramenta de exemplo e bloco salvo em 3MF", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    expect(screen.getByRole("img", { name: /Chave de fenda: 190 × 26 mm.*Tesoura: 178 × 56 mm/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/organizador-block.3mf")).toBe(true));
    expect(saved("organizador-block.3mf").match(/<item /g)).toHaveLength(1);
  }, 60_000);

  test("folga pronta preenche o valor; peça de teste sai com um contorno por ferramenta", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Média" }));
    expect(screen.getByRole("spinbutton", { name: /^Folga/ })).toHaveValue(0.6);
    await user.click(screen.getByRole("button", { name: "Peça de teste" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/organizador-test.3mf")).toBe(true));
    expect(saved("organizador-test.3mf").match(/<item /g)).toHaveLength(3);
  }, 60_000);

  test("gaveta: pede as medidas e avisa quantas bandejas", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Gaveta" }));
    expect(screen.getByRole("spinbutton", { name: /Largura da gaveta/ })).toBeInTheDocument();
    expect(await screen.findByText(/bandeja\(s\)/, undefined, BUILD)).toBeInTheDocument();
  }, 60_000);
});
