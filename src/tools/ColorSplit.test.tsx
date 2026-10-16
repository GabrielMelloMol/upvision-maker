// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { colorCube3mf } from "../test/colorCube";
import ColorSplit from "./ColorSplit";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 30_000 };
const fixture = (n: string) => new File([readFileSync(resolve(__dirname, "../../tests/fixtures/3mf", n))], n);

describe("Separar as cores de um arquivo", () => {
  test("3MF pintado do Bambu: lista as 3 cores e salva um objeto com uma parte por cor", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    expect(screen.getByText("Envie um 3MF pintado para separar as cores.")).toBeInTheDocument();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("cubo-pintado-bambu.3mf"));
    const list = await screen.findByLabelText("Cores encontradas", undefined, BUILD);
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Filamento 1 do arquivo"),
      expect.stringContaining("Filamento 2 do arquivo · 0,4 cm³"),
      expect.stringContaining("Filamento 3 do arquivo"),
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

  test("cortar com encaixe: parte A, parte B e pinos no arquivo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, fixture("chaveiro-2-partes-bambu.3mf"));
    await screen.findByLabelText("Cores encontradas", undefined, BUILD);
    await user.click(screen.getByRole("switch", { name: /Cortar com encaixe/ }));
    await user.click(screen.getByRole("button", { name: "Vertical (X)" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/chaveiro-2-partes-bambu-cores.3mf")).toBe(true));
    const names = [...strFromU8(unzipSync(t.files.get("/saida/chaveiro-2-partes-bambu-cores.3mf")!)["3D/3dmodel.model"]).matchAll(/<object id="\d+" name="([^"]+)"/g)].map((m) => m[1]);
    expect(names.some((n) => n.endsWith("parte A"))).toBe(true);
    expect(names.some((n) => n.endsWith("parte B"))).toBe(true);
  }, 60_000);

  test("3MF que pinta por material (#229): lista os grupos de cor, separa os menores e dá para deixar um na base", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    const file = new File([colorCube3mf({ cima: [1, 3], baixo: 1, frente: 2 }).slice()], "cubo-materiais.3mf");
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    const card = await screen.findByLabelText("Cores do arquivo", undefined, BUILD);
    const rows = within(card).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual([expect.stringContaining("Base"), expect.stringContaining("Separar"), expect.stringContaining("Separar")]);
    expect(within(card).getAllByRole("button", { pressed: true })).toHaveLength(2);
    await waitFor(() => expect(within(screen.getByLabelText("Cores encontradas")).getAllByRole("listitem")).toHaveLength(3), BUILD);
    // deixar o azul na base: sobram duas cores e aparece o "Voltar ao automático"
    await user.click(within(card).getAllByRole("button", { pressed: true })[1]);
    await waitFor(() => expect(within(screen.getByLabelText("Cores encontradas")).getAllByRole("listitem")).toHaveLength(2), BUILD);
    await user.click(screen.getByRole("button", { name: "Voltar ao automático" }));
    await waitFor(() => expect(within(screen.getByLabelText("Cores encontradas")).getAllByRole("listitem")).toHaveLength(3), BUILD);
  }, 60_000);

  test("objetos separados: aparece 'manter a posição original'; o corte aceita várias partes", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    expect(screen.queryByText(/Manter a posição original/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Objetos separados" }));
    expect(screen.getByText(/Manter a posição original/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Cortar com encaixe/));
    expect(screen.getByLabelText(/Número de partes/)).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  test("nomes de cor em português, sem código; com filamento cadastrado parecido ele é sugerido e entra no peso e no custo (#229)", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 100, 1000, 1000, 0)");
    const user = userEvent.setup();
    const { container } = renderWithApp(<ColorSplit />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([readFileSync(resolve(__dirname, "../../tests/fixtures/3mf/personagem-colorido-material.3mf"))], "personagem.3mf"));
    const found = await screen.findByLabelText("Cores encontradas", undefined, BUILD);
    await waitFor(() => expect(within(found).getAllByRole("listitem")).toHaveLength(4), BUILD);
    // nenhum código de cor aparece como texto (só no detalhe, em title)
    expect(screen.queryByText(/#[0-9a-f]{6}/i)).toBeNull();
    const blue = within(found).getByText("Azul").closest("li")!;
    expect(within(blue).getByText(/parece com: PLA Azul Bambu/)).toBeInTheDocument();
    expect(blue.textContent).toMatch(/~R\$\s?\d/); // o custo usa o preço do filamento
    const green = within(found).getByText("Verde").closest("li")!;
    expect(within(green).getByText(/Nenhum filamento cadastrado parecido/)).toBeInTheDocument();
    expect(within(blue).getByTitle(/Código da cor: #[0-9a-f]{6}/)).toBeInTheDocument();
  }, 60_000);
});
