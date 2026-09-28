// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import SpoolLabels from "./SpoolLabels";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
beforeAll(() => {
  // fontes (3D e PDF): o app busca a URL do bundle; aqui lê o arquivo
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

async function seed() {
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Voolt', 100, 1000, 2300, 200)");
  await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PETG', 'Preto', '', 120, 1000, 1000, 200)");
}
const stock = async (id: number) => (await t.db.select<{ stockG: number }>("SELECT stockG FROM filaments WHERE id = ?", [id]))[0].stockG;

describe("Etiquetas de rolo", () => {
  test("sem filamentos: estado vazio", async () => {
    renderWithApp(<SpoolLabels />);
    expect(await screen.findByText("Nenhum filamento cadastrado")).toBeInTheDocument();
  });

  test("marca filamentos, salva o PDF de etiquetas e mostra as plaquinhas 3D", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<SpoolLabels />);
    await user.click(await screen.findByRole("button", { name: /Marcar todos/ }));
    expect(screen.getByText("2 escolhidos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Salvar etiquetas/ }));
    expect(await screen.findByText("Etiquetas salvas em /saida/etiquetas-de-rolo.pdf", undefined, { timeout: 15_000 })).toBeInTheDocument();
    expect(new TextDecoder().decode(t.files.get("/saida/etiquetas-de-rolo.pdf")!.subarray(0, 5))).toBe("%PDF-");
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), { timeout: 15_000 });
  }, 30_000);

  test("lendo o código (leitor USB/digitado): dá baixa de gramas e marca o rolo como acabado", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<SpoolLabels />);
    await screen.findByRole("button", { name: /Marcar todos/ });
    await user.type(screen.getByLabelText("Código da etiqueta"), "upvision:filamento/1{Enter}");
    const card = await screen.findByLabelText("Rolo lido");
    expect(card).toHaveTextContent("PLA Azul · Voolt · #1");
    expect(card).toHaveTextContent("Estoque 2.300 g · rolo de 1.000 g");
    await user.clear(screen.getByLabelText(/Usei/));
    await user.type(screen.getByLabelText(/Usei/), "120");
    await user.click(screen.getByRole("button", { name: /Dar baixa/ }));
    expect(await screen.findByText(/Baixa de 120 g em PLA Azul\. Estoque: 2\.180 g\./)).toBeInTheDocument();
    expect(await stock(1)).toBe(2180);
    await user.click(screen.getByRole("button", { name: /Rolo acabou/ }));
    expect(await screen.findByText(/marcado como acabado\. Estoque: 2\.000 g\./)).toBeInTheDocument();
    expect(await stock(1)).toBe(2000);
  });

  test("QR de outra coisa ou filamento apagado: aviso", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithApp(<SpoolLabels />);
    await screen.findByRole("button", { name: /Marcar todos/ });
    await user.type(screen.getByLabelText("Código da etiqueta"), "https://exemplo.com{Enter}");
    expect(screen.getByText(/não é uma etiqueta de rolo/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código da etiqueta"), "upvision:filamento/99{Enter}");
    expect(screen.getByText("Filamento #99 não está mais cadastrado.")).toBeInTheDocument();
  });
});
