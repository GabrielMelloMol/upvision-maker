// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { boxStl } from "../test/boxStl";
import OwnDecal from "./OwnDecal";

// o visualizador de verdade precisa de WebGL: a prévia de teste devolve um acerto fixo na face da direita (+X)
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => ({ point: [40, 10, 10], normal: [1, 0, 0] }) }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const stl = () => new File([boxStl(40, 30, 20)], "caixa.stl", { type: "model/stl" });

beforeAll(() => void t);

async function open(container: HTMLElement) {
  const user = userEvent.setup();
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl());
  return user;
}

describe("Decal no seu modelo (#113)", { timeout: 60_000 }, () => {
  test("sem arquivo: pede o STL/3MF e já mostra o aviso de licença", () => {
    renderWithApp(<OwnDecal />);
    expect(screen.getByText(/Use só modelos que são seus ou cuja licença permite/)).toBeInTheDocument();
    expect(screen.getByText("Envie um STL ou 3MF para começar.")).toBeInTheDocument();
  });

  test("arquivo lido: lista as 6 faces planas e a escolha de uma delas libera camadas e destaca a face", async () => {
    const { container } = renderWithApp(<OwnDecal />);
    const user = await open(container);
    const group = await screen.findByRole("group", { name: "Faces planas" });
    expect(group.querySelectorAll("button")).toHaveLength(6);
    expect(screen.getByText("Escolha uma face primeiro.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Face 1 · para (cima|baixo) · 40,0 × 30,0 mm/ }));
    await waitFor(() => expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toContain("Face escolhida"), BUILD);
    expect(screen.queryByText("Escolha uma face primeiro.")).toBeNull();
  }, 40_000);

  test("clicar na prévia escolhe a face; um desenho embutido vira parte colorida e sai no 3MF sem a face de destaque", async () => {
    const { container } = renderWithApp(<OwnDecal />);
    const user = await open(container);
    await screen.findByRole("group", { name: "Faces planas" });
    const viewer = container.querySelector(".viewer")!;
    fireEvent.pointerDown(viewer, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(viewer, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(screen.getByRole("button", { name: /para a direita/ })).toHaveAttribute("aria-pressed", "true"));
    await user.upload(screen.getByLabelText("Arquivo do desenho"), new File([SQUARE], "quadrado.svg", { type: "image/svg+xml" }));
    await waitFor(() => expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toContain("Desenho 1"), BUILD);
    expect(container.querySelector(".decal-gizmo")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/caixa-decal.3mf")).toBe(true));
  }, 40_000);

  test("arraste na prévia (girar a câmera) não escolhe face", async () => {
    const { container } = renderWithApp(<OwnDecal />);
    await open(container);
    await screen.findByRole("group", { name: "Faces planas" });
    const viewer = container.querySelector(".viewer")!;
    fireEvent.pointerDown(viewer, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(viewer, { clientX: 80, clientY: 60 });
    expect(screen.queryByRole("button", { pressed: true })).toBeNull();
  });

  test("arquivo que não é STL nem 3MF: avisa", async () => {
    const { container } = renderWithApp(<OwnDecal />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByText("Envie um arquivo .stl ou .3mf.")).toBeInTheDocument();
  });
});
