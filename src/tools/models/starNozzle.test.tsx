// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setBed } from "../../geometry/bed";
import { renderWithApp, setupTauri } from "../../test/harness";
import { openWith } from "../intent";
import Models from "../Models";
import { MODELS } from "./defs";

vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
setupTauri();
afterEach(() => setBed(null));

const star = () => MODELS.find((m) => m.id === "starMap")!;
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("Mapa estelar usa o bico da impressora das ferramentas", () => {
  test("o padrão do modelo vem do bico da impressora escolhida; sem impressora, 0,4", () => {
    expect(star().liveDefaults?.()).toEqual({ nozzle: "0.4" });
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.2 });
    expect(star().liveDefaults?.()).toEqual({ nozzle: "0.2" });
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.6 });
    expect(star().liveDefaults?.()).toEqual({ nozzle: "0.6" });
  });

  test("a tela abre com o bico 0,2 da impressora marcado, a prévia com a estrela mínima de 0,3 mm e as linhas de 0,4 mm", async () => {
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.2 });
    openWith("models", { id: "starMap" });
    renderWithApp(<Models />);
    const group = await screen.findByRole("group", { name: "Bico da impressora" });
    expect(within(group).getByRole("button", { name: "0,2 mm" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "0,4 mm" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText(/linhas:/)).toHaveTextContent("linhas: 0,4 mm");
    expect(screen.getByText(/Menor estrela:/)).toHaveTextContent("0,3 mm");
  });

  test("trocar a variação (Casamento) mantém o bico da impressora; dá para trocar o bico à mão", async () => {
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.2 });
    openWith("models", { id: "starMap" });
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await screen.findByRole("group", { name: "Bico da impressora" });
    await user.click(screen.getByRole("button", { name: "Casamento" }));
    expect(pressed("0,2 mm")).toBe("true");
    await user.click(screen.getByRole("button", { name: "0,6 mm" }));
    expect(pressed("0,6 mm")).toBe("true");
    expect(screen.getByText(/linhas:/)).toHaveTextContent("linhas: 1,2 mm");
  });

  test("sem impressora (padrão 0,4): abre no 0,4 e a estrela mínima é de 0,6 mm", async () => {
    openWith("models", { id: "starMap" });
    renderWithApp(<Models />);
    await screen.findByRole("group", { name: "Bico da impressora" });
    expect(pressed("0,4 mm")).toBe("true");
    expect(screen.getByText(/Menor estrela:/)).toHaveTextContent("0,6 mm");
  });
});
