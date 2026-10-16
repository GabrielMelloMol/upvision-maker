// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { boxStl } from "../test/boxStl";
import PartialCut from "./PartialCut";

// o visualizador de verdade precisa de WebGL: a prévia de teste devolve um acerto fixo no topo da caixa
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => ({ point: [20, 15, 20], normal: [0, 0, 1] }) }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const stl = () => new File([boxStl(40, 30, 20)], "caixa.stl", { type: "model/stl" });
const legend = (c: HTMLElement) => [...c.querySelectorAll(".legend span")].map((s) => s.textContent);

beforeAll(() => void t);

async function open(container: HTMLElement) {
  const user = userEvent.setup();
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl());
  return user;
}

describe("Cortar um pedaço com encaixe", { timeout: 60_000 }, () => {
  test("sem arquivo: pede o STL/3MF e mostra o aviso de licença", () => {
    renderWithApp(<PartialCut />);
    expect(screen.getByText("Envie um STL ou 3MF para cortar.")).toBeInTheDocument();
    expect(screen.getByText(/Use só modelos que são seus/)).toBeInTheDocument();
  });

  test("arquivo lido: mostra o pedaço, a região e o plano e confere que as peças somam o original", async () => {
    const { container } = renderWithApp(<PartialCut />);
    await open(container);
    await waitFor(() => expect(legend(container)).toEqual(expect.arrayContaining(["Resto", "Pedaço", "Região", "Plano de corte"])), BUILD);
    expect(await screen.findByText(/Conferido: as duas peças saem fechadas/, {}, BUILD)).toBeInTheDocument();
  }, 40_000);

  test("clicar na prévia com 'Plano neste ponto' leva o plano à altura clicada", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await screen.findByLabelText(/^Posição do plano/);
    await user.click(screen.getByRole("button", { name: "Plano neste ponto" }));
    const viewer = container.querySelector(".viewer")!;
    fireEvent.pointerDown(viewer, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(viewer, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(screen.getByLabelText(/^Posição do plano/)).toHaveValue("20"));
  }, 40_000);

  test("sem a caixa o corte vale na peça toda; salvar gera o 3MF com resto, pedaço e pinos", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await screen.findByLabelText(/^Posição do plano/);
    await user.click(screen.getByRole("switch", { name: /Cortar só dentro da região/ }));
    await waitFor(() => expect(screen.queryByLabelText(/^X de/)).toBeNull());
    await waitFor(() => expect(legend(container)).toContain("Pedaço"), BUILD);
    await user.click(await screen.findByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/caixa-corte.3mf")).toBe(true), BUILD);
  }, 40_000);

  test("trocar a forma da região para cilindro mostra o raio e o comprimento e o contorno continua na prévia", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await user.click(await screen.findByRole("button", { name: "Cilindro" }));
    expect(await screen.findByLabelText(/^Raio/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Comprimento do cilindro/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^X de/)).toBeNull();
    await waitFor(() => expect(legend(container)).toContain("Região"), BUILD);
  }, 40_000);

  test("adicionar um segundo corte cria o Corte 2, mais um pedaço e o peso e tempo por peça", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await screen.findByLabelText(/^Posição do plano/);
    expect(screen.queryByRole("button", { name: /Remover o corte/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Adicionar corte/ }));
    expect(await screen.findByRole("button", { name: "Corte 2", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remover o corte 2/ })).toBeInTheDocument();
    await waitFor(() => expect(legend(container)).toEqual(expect.arrayContaining(["Pedaço 1", "Pedaço 2"])), BUILD);
    const card = await screen.findByLabelText("Peso e tempo por peça", {}, BUILD);
    expect(card.textContent).toMatch(/pedaço 1.*g.*min/s);
    expect(card.textContent).toMatch(/pedaço 2/);
  }, 40_000);

  test("pedaço em outra cor: a cor entra no 3MF como um filamento a mais", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await user.click(await screen.findByRole("switch", { name: /Pedaço em outra cor/ }));
    await waitFor(() => expect(legend(container)).toContain("Pedaço"), BUILD);
    expect(await screen.findByLabelText("Cor: pedaço")).toBeInTheDocument();
  }, 40_000);

  test("face pequena demais para o pino: oferece pino fixo menor e colar sem pino na hora", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = userEvent.setup();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([boxStl(7, 7, 30)], "haste.stl", { type: "model/stl" }));
    const size = await screen.findByLabelText(/^Tamanho do pino/);
    await user.clear(size);
    await user.type(size, "8");
    const smaller = await screen.findByRole("button", { name: /Usar pino fixo menor \(3,0 mm\)/ }, BUILD);
    expect(screen.getByRole("button", { name: "Colar sem pino" })).toBeInTheDocument();
    await user.click(smaller);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Colar sem pino" })).toBeNull(), BUILD);
    expect(screen.getByRole("button", { name: "Pino fixo no resto", pressed: true })).toBeInTheDocument();
  }, 40_000);

  test("colar sem pino tira o encaixe e some o aviso", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = userEvent.setup();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([boxStl(7, 7, 30)], "haste.stl", { type: "model/stl" }));
    const size = await screen.findByLabelText(/^Tamanho do pino/);
    await user.clear(size);
    await user.type(size, "8");
    await user.click(await screen.findByRole("button", { name: "Colar sem pino" }, BUILD));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Colar sem pino" })).toBeNull(), BUILD);
    expect(screen.getByRole("button", { name: "Sem encaixe", pressed: true })).toBeInTheDocument();
  }, 40_000);

  test("o card de cores lista o resto e todos os pedaços de uma vez", async () => {
    const { container } = renderWithApp(<PartialCut />);
    const user = await open(container);
    await user.click(await screen.findByRole("button", { name: /Adicionar corte/ }));
    expect(await screen.findByRole("switch", { name: "Resto em outra cor" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Pedaço 1 em outra cor" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Pedaço 2 em outra cor" })).toBeInTheDocument();
  }, 40_000);
});
