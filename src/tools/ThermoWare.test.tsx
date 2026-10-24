// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import ThermoWare from "./ThermoWare";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 40_000 };

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const objects = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
const saveButtons = () => screen.getAllByRole("button", { name: /Salvar 3MF/ });
const ready = () => waitFor(() => expect(saveButtons()[0]).toBeEnabled(), BUILD);
const fileOf = (re: RegExp) => [...t.files.keys()].find((f) => re.test(f));

describe("Pote, cesto e pulseira termoformados", () => {
  test("pote: disco em PLA e molde macho em PETG em arquivos separados, com a conta do disco e o passo a passo", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    await ready();
    const summary = await screen.findByRole("region", { name: "Resumo da termoformagem" }, BUILD);
    expect(within(summary).getByText(/Disco plano de/)).toBeInTheDocument();
    expect(within(summary).getByText(/Disco do pote: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Molde macho: ≈/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passo a passo da termoformagem" })).toBeInTheDocument();
    await user.click(saveButtons()[0]);
    await waitFor(() => expect(fileOf(/pote-termoformado.*\.3mf$/)).toBeTruthy());
    expect(objects(t.files.get(fileOf(/pote-termoformado.*\.3mf$/)!)!)).toBe(1);
    await user.click(saveButtons()[1]);
    await waitFor(() => expect(fileOf(/pote-molde.*\.3mf$/)).toBeTruthy());
    expect(objects(t.files.get(fileOf(/pote-molde.*\.3mf$/)!)!)).toBe(1);
  }, 90_000);

  test("cesto: malha e fundo sólido; o par de moldes sai com macho e fêmea", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    await user.click(screen.getByRole("button", { name: "Cesto" }));
    expect(screen.getByText(/a parede é uma malha/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "O par (prensa)" }));
    expect(screen.getByText(/O par prensa o disco/)).toBeInTheDocument();
    await ready();
    const summary = await screen.findByRole("region", { name: "Resumo da termoformagem" }, BUILD);
    expect(await within(summary).findByText(/Disco do cesto: ≈/, undefined, BUILD)).toBeInTheDocument();
    expect(within(summary).getByText(/Molde fêmea: ≈/)).toBeInTheDocument();
    await user.click(saveButtons()[1]);
    await waitFor(() => expect(fileOf(/cesto-molde.*\.3mf$/)).toBeTruthy());
    expect(objects(t.files.get(fileOf(/cesto-molde.*\.3mf$/)!)!)).toBe(2);
    await user.click(screen.getByRole("button", { name: "Pronto (não imprime)" }));
    expect(screen.getByText(/O cesto já formado, de pé/)).toBeInTheDocument();
  }, 90_000);

  test("pulseira: tira e mandril, com a conta da tira", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    await user.click(screen.getByRole("button", { name: "Pulseira" }));
    await ready();
    const summary = await screen.findByRole("region", { name: "Resumo da termoformagem" }, BUILD);
    expect(await within(summary).findByText(/Tira plana de/, undefined, BUILD)).toBeInTheDocument();
    expect(within(summary).getByText(/Mandril: ≈/)).toBeInTheDocument();
    await user.click(saveButtons()[1]);
    await waitFor(() => expect(fileOf(/pulseira-molde.*\.3mf$/)).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Pronto (não imprime)" }));
    expect(screen.getByText(/A pulseira já enrolada no mandril/)).toBeInTheDocument();
  }, 90_000);

  test("trocar do pote já pronto para a pulseira não quebra a tela e mostra a conta da tira", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    await ready();
    await screen.findByText(/Disco plano de/, undefined, BUILD);
    await user.click(screen.getByRole("button", { name: "Pulseira" }));
    expect(screen.getByRole("heading", { name: "Pote, cesto e pulseira termoformados" })).toBeInTheDocument();
    expect(await screen.findByText(/Tira plana de/, undefined, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pote" }));
    expect(await screen.findByText(/Disco plano de/, undefined, BUILD)).toBeInTheDocument();
  }, 120_000);

  test("valor fora da faixa fica marcado e não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    const w = screen.getByLabelText(/Diâmetro da boca/);
    await user.clear(w);
    await user.type(w, "900");
    expect(await screen.findByText("Corrija os campos em vermelho para ver a peça.")).toBeInTheDocument();
  });

  test("ângulo de saída pequeno avisa", async () => {
    const user = userEvent.setup();
    renderWithApp(<ThermoWare />);
    const a = screen.getByLabelText(/Ângulo de saída/);
    await user.clear(a);
    await user.type(a, "3");
    expect(await screen.findByText(/O ângulo de saída de 3° é pequeno/, undefined, BUILD)).toBeInTheDocument();
  }, 60_000);
});
