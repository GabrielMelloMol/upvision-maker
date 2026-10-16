// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, test, vi } from "vitest";
import { boxStl } from "../test/boxStl";
import { renderWithApp, setupTauri } from "../test/harness";
import Texturize from "./Texturize";

vi.mock("../geometry/fonts", async (orig) => {
  const mod = await orig<typeof import("../geometry/fonts")>();
  const b = readFileSync("node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { ...mod, loadFont: async () => font };
});
const hit = vi.hoisted(() => ({ point: [20, 0, 15] as [number, number, number], normal: [0, -1, 0] as [number, number, number] }));
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => hit }) }));

const t = setupTauri();
const BUILD = { timeout: 90_000 };
const stl = () => new File([boxStl(40, 40, 30)], "caixa.stl", { type: "model/stl" });

describe("Textura no seu modelo (#222)", { timeout: 180_000 }, () => {
  test("sem arquivo: pede o STL, explica quando usar e mostra as 16 texturas em grupos", () => {
    renderWithApp(<Texturize />);
    expect(screen.getByText("Envie um STL ou 3MF para texturizar.")).toBeInTheDocument();
    expect(screen.getByText(/Quando usar: dar acabamento/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false }).filter((b) => b.className.includes("texture-chip")).length + screen.getAllByRole("button", { pressed: true }).filter((b) => b.className.includes("texture-chip")).length).toBe(16);
    expect(screen.getByRole("button", { name: /Fibra de carbono/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("textura escolhida aparece no resultado e o 3MF sai salvo com a peça maior que a original", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Texturize />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl());
    expect(await screen.findByText(/Peça: 40,0 × 40,0 × 30,0 mm/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Colmeia/ }));
    expect(screen.getByRole("button", { name: /Colmeia/ })).toHaveAttribute("aria-pressed", "true");
    const result = await screen.findByLabelText("Resultado da textura", undefined, BUILD);
    await waitFor(() => expect(result.textContent).toMatch(/triângulos · \d+% da superfície com textura/), BUILD);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/caixa-textura.3mf")).toBe(true));
  }, 180_000);

  test("pincel: sem pincelada avisa; um clique na prévia pinta e conta a pincelada; desfazer e limpar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Texturize />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl());
    await user.click(screen.getByRole("button", { name: "Pincel" }));
    expect(await screen.findByText(/Nada pintado ainda/, undefined, BUILD)).toBeInTheDocument();
    expect(screen.getByText("0 pinceladas")).toBeInTheDocument();
    const viewer = container.querySelector(".viewer")!;
    fireEvent.pointerDown(viewer, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(viewer, { clientX: 10, clientY: 10 });
    expect(await screen.findByText("1 pincelada")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Nada pintado ainda/)).toBeNull(), BUILD);
    await user.click(screen.getByRole("button", { name: "Desfazer pincelada" }));
    expect(await screen.findByText("0 pinceladas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar" })).toBeDisabled();
  }, 180_000);

  test("frase: vira textura; sem frase o campo pede e a prévia diz para corrigir", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Texturize />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl());
    await user.click(screen.getByRole("button", { name: "Frase" }));
    const result = await screen.findByLabelText("Resultado da textura", undefined, BUILD);
    expect(within(result).getByText(/triângulos/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Frase repetida/));
    expect(await screen.findByText("Corrija os campos em vermelho.")).toBeInTheDocument();
  }, 180_000);

  test("arquivo que não é STL nem 3MF: avisa", async () => {
    const { container } = renderWithApp(<Texturize />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByText("Envie um arquivo .stl ou .3mf.")).toBeInTheDocument();
  });

  test("interior: por padrão só o lado de fora (o interruptor vem desligado) e a explicação muda ao ligar", async () => {
    const user = userEvent.setup();
    renderWithApp(<Texturize />);
    const toggle = screen.getByLabelText(/Texturizar por dentro também/);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/o interior de copo, caneca e vaso continua liso/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText(/fica áspero por dentro/)).toBeInTheDocument();
  });
});
