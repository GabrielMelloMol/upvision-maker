// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import ColorSplit from "./ColorSplit";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const fixture = (n: string) => new File([readFileSync(resolve(__dirname, "../../tests/fixtures/3mf", n))], n);

describe("Separar 3MF por cor", () => {
  test("3MF pintado do Bambu: lista as 3 cores e salva um objeto com uma parte por cor", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    expect(screen.getByText("Envie um 3MF pintado para separar as cores.")).toBeInTheDocument();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("cubo-pintado-bambu.3mf"));
    const list = await screen.findByLabelText("Cores encontradas", undefined, BUILD);
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Filamento 1"),
      expect.stringContaining("Filamento 2 · 0,4 cm³"),
      expect.stringContaining("Filamento 3"),
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/cubo-pintado-bambu-cores.3mf")).toBe(true));
    const cfg = strFromU8(unzipSync(t.files.get("/saida/cubo-pintado-bambu-cores.3mf")!)["Metadata/model_settings.config"]);
    expect(cfg.match(/<part /g)).toHaveLength(3);
  }, 60_000);

  test("objetos separados: 3 objetos no arquivo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    await user.click(screen.getByRole("button", { name: "Objetos separados" }));
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("cubo-pintado-bambu.3mf"));
    await screen.findByLabelText("Cores encontradas", undefined, BUILD);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/cubo-pintado-bambu-cores.3mf")).toBe(true));
    expect(strFromU8(unzipSync(t.files.get("/saida/cubo-pintado-bambu-cores.3mf")!)["3D/3dmodel.model"]).match(/<item /g)).toHaveLength(3);
  }, 60_000);

  test("STL é recusado com explicação", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.removeAttribute("accept");
    await user.upload(input, new File(["solid x"], "peca.stl"));
    expect(await screen.findByText(/STL não guarda a pintura/)).toBeInTheDocument();
  });
});
