// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { boxStl } from "../test/boxStl";
import Lighten from "./Lighten";

// o visualizador de verdade precisa de WebGL
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => null }) }));

const t = setupTauri();
const BUILD = { timeout: 60_000 };
beforeAll(() => void t);

describe("Miolo leve (#236)", { timeout: 120_000 }, () => {
  test("sem arquivo: pede o STL/3MF, avisa da licença e não deixa comparar", () => {
    renderWithApp(<Lighten />);
    expect(screen.getByText("Envie um STL ou 3MF para alivianar.")).toBeInTheDocument();
    expect(screen.getByText(/Use só modelos que são seus/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comparar giroide, voronoi e treliça/ })).toBeDisabled();
  });

  test("peça enviada: mostra a economia em gramas e a menor seção por eixo", async () => {
    const { container } = renderWithApp(<Lighten />);
    await userEvent.setup().upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([boxStl(40, 40, 40)], "caixa.stl", { type: "model/stl" }));
    expect(await screen.findByText(/g em PLA, contra .* g maciça: economia de/, {}, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/Menor seção de material \(X · Y · Z\)/)).toBeInTheDocument();
  }, 100_000);

  test("bloco de treliça: aceita casca 0 e compara as 3 estruturas", async () => {
    renderWithApp(<Lighten />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Bloco de treliça" }));
    expect(await screen.findByText(/g em PLA, contra/, {}, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Comparar giroide, voronoi e treliça/ }));
    const list = await screen.findByRole("list", { name: "Comparação das estruturas" }, BUILD);
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const name of ["Giroide", "Voronoi", "Treliça cúbica"]) expect(within(list).getByText(name)).toBeInTheDocument();
    expect(within(list).getAllByRole("button", { name: /Usar|Em uso/ })).toHaveLength(3);
    expect(screen.getAllByText(/não é uma simulação de carga/).length).toBeGreaterThan(0);
  }, 110_000);
});
