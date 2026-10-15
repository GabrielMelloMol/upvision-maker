// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Thermoform from "./Thermoform";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 40_000 };
// um "L" deitado: só a metade esquerda é larga (silhueta assimétrica)
const L_SHAPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><polygon points="0,0 30,0 30,10 10,10 10,30 0,30"/></svg>';

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const objects = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
const saveButtons = () => screen.getAllByRole("button", { name: /Salvar 3MF/ });
const ready = () => waitFor(() => expect(saveButtons()[0]).toBeEnabled(), BUILD);

describe("Caixinha termoformada", () => {
  test("padrão: telas e clipe num arquivo, molde em outro; peso e tempo de cada peça e o passo a passo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await ready();
    expect(screen.getByRole("heading", { name: "Passo a passo da termoformagem" })).toBeInTheDocument();
    const summary = await screen.findByRole("region", { name: "Resumo da termoformagem" }, BUILD);
    expect(within(summary).getByText(/Tela 1: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Molde de PETG: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/A tela estica cerca de/)).toBeInTheDocument();
    await user.click(saveButtons()[0]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-telas.*\.3mf$/.test(f))).toBe(true));
    const tela = [...t.files.keys()].find((f) => /caixinha-telas.*\.3mf$/.test(f))!;
    expect(objects(t.files.get(tela)!)).toBe(3); // Tela 1, Tela 2 e o clipe
    await user.click(saveButtons()[1]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-molde.*\.3mf$/.test(f))).toBe(true));
    expect(objects(t.files.get([...t.files.keys()].find((f) => /caixinha-molde.*\.3mf$/.test(f))!)!)).toBe(1);
  }, 60_000);

  test("modelo pronto Páscoa: ovo, texto e cores", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await user.click(screen.getByRole("button", { name: "Páscoa" }));
    expect(screen.getByLabelText("Formato")).toHaveValue("egg");
    expect(screen.getByLabelText(/^Texto \(uma linha/)).toHaveValue("Feliz|Páscoa");
    await ready();
  }, 60_000);

  test("silhueta assimétrica avisa; espelhar a metade resolve e o aviso some", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Thermoform />);
    await user.click(screen.getByRole("button", { name: "Imagem ou SVG" }));
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([L_SHAPE], "ele.svg", { type: "image/svg+xml" }));
    expect(await screen.findByText(/A silhueta não é simétrica/, undefined, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Espelhar a esquerda" }));
    await waitFor(() => expect(screen.queryByText(/A silhueta não é simétrica/)).not.toBeInTheDocument(), BUILD);
    await ready();
  }, 90_000);

  test("silhueta de texto vira caixinha", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    expect(screen.getByLabelText(/^Texto da silhueta/)).toHaveValue("Ana");
    await ready();
  }, 60_000);

  test("sem imagem enviada: pede a silhueta", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await user.click(screen.getByRole("button", { name: "Imagem ou SVG" }));
    expect(await screen.findByText("Envie a silhueta (SVG ou imagem) para ver a caixinha.")).toBeInTheDocument();
  });

  test("fecho por faixa: sem as opções do clipe", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    expect(screen.getByText(/Onde fica a dobradiça/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Faixa colada" }));
    expect(screen.queryByText(/Onde fica a dobradiça/)).not.toBeInTheDocument();
    await ready();
  }, 60_000);

  test("valor fora da faixa fica marcado e não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    const w = screen.getByLabelText("Largura (mm)");
    await user.clear(w);
    await user.type(w, "500");
    expect(await screen.findByText("Corrija os campos em vermelho para ver a caixinha.")).toBeInTheDocument();
  });
});
