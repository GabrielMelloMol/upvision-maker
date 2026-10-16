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
  test("padrão: telas e bases num arquivo, clipe em outro e os moldes macho e fêmea num terceiro; peso e tempo de cada peça e o passo a passo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await ready();
    expect(screen.getByRole("heading", { name: "Passo a passo da termoformagem" })).toBeInTheDocument();
    const summary = await screen.findByRole("region", { name: "Resumo da termoformagem" }, BUILD);
    expect(within(summary).getByText(/Tela 1: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Base 2: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Clipe: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Molde macho \(PETG\): ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Molde fêmea \(PETG\): ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/A tela estica cerca de/)).toBeInTheDocument();
    expect(within(summary).getByText(/Folga do molde fêmea/)).toBeInTheDocument();
    await user.click(saveButtons()[0]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-telas.*\.3mf$/.test(f))).toBe(true));
    expect(objects(t.files.get([...t.files.keys()].find((f) => /caixinha-telas.*\.3mf$/.test(f))!)!)).toBe(4); // Tela 1 e 2, Base 1 e 2
    await user.click(saveButtons()[1]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-fecho.*\.3mf$/.test(f))).toBe(true));
    expect(objects(t.files.get([...t.files.keys()].find((f) => /caixinha-fecho.*\.3mf$/.test(f))!)!)).toBe(1);
    await user.click(saveButtons()[2]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-molde.*\.3mf$/.test(f))).toBe(true));
    expect(objects(t.files.get([...t.files.keys()].find((f) => /caixinha-molde.*\.3mf$/.test(f))!)!)).toBe(2);
  }, 90_000);

  test("tampa rosqueada: o arquivo do fecho vira a tampa e as bases das duas metades ficam ligadas", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await ready();
    await user.click(screen.getByRole("button", { name: "Tampa rosqueada" }));
    expect(await screen.findByRole("heading", { name: /Tampa rosqueada \(PLA, 0,16 mm\)/ }, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/Cada base leva metade de um pino rosqueado/)).toBeInTheDocument();
    expect(screen.queryByText(/Onde fica a dobradiça/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nas duas metades" })).toHaveAttribute("aria-pressed", "true");
    await ready();
  }, 90_000);

  test("texto pronto para a IA: copia a descrição da silhueta simétrica", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await user.click(screen.getByText(/Não tem a silhueta\? Peça a uma IA de imagem/));
    const field = screen.getByLabelText("O que desenhar");
    await user.clear(field);
    await user.type(field, "uma estrela do mar");
    expect((screen.getByLabelText("Texto para a IA de imagem") as HTMLTextAreaElement).value).toContain("silhueta de uma estrela do mar");
    await user.click(screen.getByRole("button", { name: /Copiar texto/ }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toMatch(/perfeitamente simétrica/);
    expect(copied).toMatch(/preto sólido sobre fundo branco/);
    expect(copied).toMatch(/sem pontas finas/);
  }, 30_000);

  test("passo a passo: soprador por padrão e água quente com a temperatura aproximada", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    const steps = screen.getByRole("region", { name: "Passo a passo da termoformagem" });
    expect(within(steps).getByText(/soprador de ar quente/)).toBeInTheDocument();
    await user.click(within(steps).getByRole("button", { name: "Água quente" }));
    expect(within(steps).getByText(/70 a 80 °C/)).toBeInTheDocument();
    expect(within(steps).queryByText(/soprador de ar quente/)).not.toBeInTheDocument();
    expect(within(steps).getByText(/Temperaturas e tempos são de referência/)).toBeInTheDocument();
    expect(within(steps).getByText(/inov3d|Inov3D/i)).toBeInTheDocument();
  }, 30_000);

  test("modelo pronto Páscoa: ovo, texto e cores", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await user.click(screen.getByRole("button", { name: "Páscoa" }));
    expect(screen.getByLabelText("Formato")).toHaveValue("egg");
    expect(screen.getByLabelText(/^Texto \(Enter para nova linha\)/)).toHaveValue("Feliz\nPáscoa");
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
    expect(screen.getByLabelText(/^Texto da silhueta \(Enter/)).toHaveValue("Ana");
    await ready();
  }, 120_000);

  test("Mesa mostra o que imprime; Montada mostra a caixinha curva e avisa que não imprime", async () => {
    const user = userEvent.setup();
    renderWithApp(<Thermoform />);
    await ready();
    expect(screen.getByRole("button", { name: "Mesa (o que imprime)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Prévia da caixinha já prensada/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Montada (não imprime)" }));
    expect(screen.getByText(/Ela não vai para o arquivo/)).toBeInTheDocument();
    await ready(); // a prévia montada só é calculada quando se pede: salvar espera ela terminar
    // salvar continua salvando só as peças de imprimir (telas + bases)
    await user.click(saveButtons()[0]);
    await waitFor(() => expect([...t.files.keys()].some((f) => /caixinha-telas.*\.3mf$/.test(f))).toBe(true));
    expect(objects(t.files.get([...t.files.keys()].find((f) => /caixinha-telas.*\.3mf$/.test(f))!)!)).toBe(4);
    await user.click(screen.getByRole("button", { name: "Casca prensada (não imprime)" }));
    expect(screen.getByText(/Uma casca já prensada, de perto/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mesa (o que imprime)" }));
    expect(screen.queryByText(/Prévia da caixinha já prensada/)).not.toBeInTheDocument();
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
