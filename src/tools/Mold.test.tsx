// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { boxStl } from "../test/boxStl";
import { renderWithApp, setupTauri } from "../test/harness";
import Mold from "./Mold";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {}, pick: () => null }) }));

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

describe("Molde a partir de STL", { timeout: 60_000 }, () => {
  test("sem arquivo: pede o STL/3MF e mostra o aviso de licença", () => {
    renderWithApp(<Mold />);
    expect(screen.getByText("Envie um STL ou 3MF para fazer o molde.")).toBeInTheDocument();
    expect(screen.getByText(/Use só peças que são suas/)).toBeInTheDocument();
  });

  test("arquivo lido: sai com as duas metades, a cavidade com o volume da peça e a conta de material", async () => {
    const { container } = renderWithApp(<Mold />);
    await open(container);
    await waitFor(() => expect(legend(container)).toEqual(expect.arrayContaining(["Metade de baixo", "Metade de cima"])), BUILD);
    // caixa 40 × 30 × 20 = 24 mL (+10% de sobra = 26 mL)
    expect(await screen.findByText(/24 mL/, {}, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/26 mL/)).toBeInTheDocument();
  }, 40_000);

  test("salvar gera o 3MF com as duas metades", async () => {
    const { container } = renderWithApp(<Mold />);
    const user = await open(container);
    await waitFor(() => expect(legend(container)).toContain("Metade de cima"), BUILD);
    await user.click(await screen.findByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/caixa-molde.3mf")).toBe(true), BUILD);
  }, 40_000);

  test("sem canal: nenhum campo de diâmetro do canal e a peça continua saindo", async () => {
    const { container } = renderWithApp(<Mold />);
    const user = await open(container);
    await user.click(await screen.findByRole("button", { name: "Sem canal" }));
    await waitFor(() => expect(screen.queryByLabelText(/^Diâmetro do canal/)).toBeNull());
    await waitFor(() => expect(legend(container)).toContain("Metade de baixo"), BUILD);
  }, 40_000);
});
