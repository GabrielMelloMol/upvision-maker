// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test, vi } from "vitest";
import { renderScene, type Scene } from "../organizer/photo/testPhoto";
import { renderWithApp, setupTauri } from "../test/harness";
import ToolFit from "./ToolFit";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
// foto sintética (a mesma dos testes do PhotoStep): uma caixa de 100 × 40 mm numa A4
const SCENE: Scene = { sheet: { w: 210, h: 297 }, boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }], camera: [140, 260, 420], target: [105, 150, 0], focalPx: 650, size: [800, 600], roll: 5 };
vi.mock("../organizer/photoFile", () => ({ loadToolPhoto: async () => ({ img: renderScene(SCENE, 2), url: "blob:foto", focalPx: null }) }));

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

  test("foto da folha troca os exemplos pelo contorno medido e a peça usa ele", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ToolFit />);
    expect(screen.getByText(/ferramentas de exemplo/)).toBeInTheDocument();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "ferramentas.jpg", { type: "image/jpeg" }));
    const sheet = await screen.findByRole("img", { name: /Folha de 210 × 297 mm\. Ferramenta 1: 10\d × (39|40|41) mm$/ }, BUILD);
    expect(sheet).toBeInTheDocument();
    expect(screen.queryByText(/ferramentas de exemplo/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
  }, 60_000);

  test("gaveta: pede as medidas e avisa quantas bandejas", async () => {
    const user = userEvent.setup();
    renderWithApp(<ToolFit />);
    await user.click(screen.getByRole("button", { name: "Gaveta" }));
    expect(screen.getByRole("spinbutton", { name: /Largura da gaveta/ })).toBeInTheDocument();
    expect(await screen.findByText(/bandeja\(s\)/, undefined, BUILD)).toBeInTheDocument();
  }, 60_000);
});
