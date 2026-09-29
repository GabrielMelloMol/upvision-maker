// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Medal from "./Medal";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 15_000 };
const STAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,0 13,7 20,7 14,12 16,20 10,15 4,20 6,12 0,7 7,7"/></svg>';

// As fontes vêm por URL do Vite (/node_modules/...): no Node, lê do disco.
beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const legend = (c: HTMLElement) => [...c.querySelectorAll(".legend span")].map((x) => x.textContent);
const objects = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;

describe("Medalhas", () => {
  test("padrão (redonda, CAMPEÃ): 60 mm com alça, base, borda e textos; salva 3MF", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    expect(await screen.findByText(/^60\.0 ×/, undefined, BUILD)).toBeInTheDocument();
    expect(legend(container)).toEqual(["Base", "Borda", "Textos"]);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalha-campea.3mf")).toBe(true));
  });

  test("preset Corrida: arco em cima, 10K, louros e verso com data (peças Verso e Pinos)", async () => {
    const user = userEvent.setup();
    renderWithApp(<Medal />);
    await user.click(screen.getByRole("button", { name: "Corrida" }));
    expect(screen.getByLabelText("Em arco, em cima")).toHaveValue("CORRIDA DE RUA");
    expect(screen.getByLabelText("Linha central")).toHaveValue("10K");
    expect(screen.getByLabelText("Estilo da borda")).toHaveValue("laurel");
    expect(screen.getByLabelText(/Texto do verso/)).toHaveValue("28/09/2026\nPARABÉNS!");
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalha-10k.3mf")).toBe(true));
    expect(objects(t.files.get("/saida/medalha-10k.3mf")!)).toBe(3); // frente, verso e pinos
  }, 30_000);

  test("imagem no centro vira mais uma parte; remover tira", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([STAR_SVG], "estrela.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText("estrela.svg")).toBeInTheDocument();
    await waitFor(() => expect(legend(container)).toContain("Imagem"), BUILD);
    await user.click(screen.getByRole("button", { name: "Remover imagem" }));
    await waitFor(() => expect(legend(container)).not.toContain("Imagem"), BUILD);
  });

  test("estrela sem alça e sem texto: nome padrão no arquivo; fonte por campo", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    await user.selectOptions(screen.getByLabelText("Formato"), "star");
    await user.clear(screen.getByLabelText("Linha central"));
    await user.click(within(screen.getByRole("group", { name: "Pendurar" })).getByRole("button", { name: "Nenhuma" }));
    await user.selectOptions(screen.getByLabelText("Fonte: em arco, em cima"), "fredoka");
    await waitFor(() => expect(container.querySelector(".hud")?.textContent).toMatch(/^60\.0 × 5\d\.\d × 4\.0 mm$/), BUILD); // estrela (3 mm + 1 de relevo): mais baixa que larga
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalha-sem-texto.3mf")).toBe(true));
  }, 30_000);

  test("tamanho fora da faixa ou baixo relevo mais fundo que a peça: não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Medal />);
    await user.clear(screen.getByLabelText(/^Tamanho \(/));
    await user.type(screen.getByLabelText(/^Tamanho \(/), "5");
    expect(await screen.findByText("Corrija os campos em vermelho.", undefined, BUILD)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Tamanho \(/));
    await user.type(screen.getByLabelText(/^Tamanho \(/), "60");
    await user.click(screen.getByRole("switch", { name: /Baixo relevo/ }));
    await user.clear(screen.getByLabelText(/^Relevo/));
    await user.type(screen.getByLabelText(/^Relevo/), "2.8");
    expect(await screen.findByText(/relevo precisa ser menor que a espessura/)).toBeInTheDocument();
  });

  test("imagem inválida mostra erro", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("bad")));
    const user = userEvent.setup();
    const { container } = renderWithApp(<Medal />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(/Não consegui abrir esta imagem/)).toBeInTheDocument();
  });

  test("cores de base, borda e textos vão para as partes", async () => {
    const { container } = renderWithApp(<Medal />);
    const [base, rim, txt] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.input(base, { target: { value: "#ff0000" } });
    fireEvent.input(rim, { target: { value: "#00ff00" } });
    fireEvent.input(txt, { target: { value: "#0000ff" } });
    await waitFor(() => expect([...container.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.background)).toEqual(["#ff0000", "#00ff00", "#0000ff"]), BUILD);
  });

  test("lote: uma medalha por linha (nome no centro, colocação), todas numa mesa", async () => {
    const user = userEvent.setup();
    renderWithApp(<Medal />);
    await user.click(screen.getByRole("switch", { name: /Lote/ }));
    expect(screen.getByText("3 medalhas · o nome vai na linha central")).toBeInTheDocument();
    expect(screen.getByLabelText("Linha central")).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/medalhas.3mf")).toBe(true));
    expect(objects(t.files.get("/saida/medalhas.3mf")!)).toBe(3);
  }, 30_000);
});
