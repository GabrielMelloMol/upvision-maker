// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Invite from "./Invite";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 60_000 };

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const objects = (buf: Uint8Array) => (strFromU8(unzipSync(buf)["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
const saveButtons = () => screen.getAllByRole("button", { name: /Salvar 3MF/ });
const ready = () => waitFor(() => expect(saveButtons()[0]).toBeEnabled(), BUILD);
const fileLike = (re: RegExp) => [...t.files.keys()].find((f) => re.test(f));

describe("Convite envelope", () => {
  test("padrão: o envelope sai com a pausa do tule; o cartão e as peças em arquivos separados", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await ready();
    const summary = await screen.findByRole("region", { name: "Resumo do convite" }, BUILD);
    expect(within(summary).getByText(/coloque o tule agora/)).toBeInTheDocument();
    expect(within(summary).getByText(/Envelope: ≈/)).toBeInTheDocument();
    expect(within(summary).getByText(/Cartão: ≈/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passo a passo no tule" })).toBeInTheDocument();
    await user.click(saveButtons()[0]);
    await waitFor(() => expect(fileLike(/convite-envelope.*\.3mf$/)).toBeTruthy());
    const env = unzipSync(t.files.get(fileLike(/convite-envelope.*\.3mf$/)!)!);
    // camadas de 0,2: tule em 0,6 → pausa antes da 4ª (topo em 0,8)
    expect(strFromU8(env["Metadata/custom_gcode_per_layer.xml"])).toContain('top_z="0.8"');
    expect(objects(t.files.get(fileLike(/convite-envelope.*\.3mf$/)!)!)).toBe(1);
    await user.click(saveButtons()[1]);
    await waitFor(() => expect(fileLike(/convite-cartao.*\.3mf$/)).toBeTruthy());
    expect(unzipSync(t.files.get(fileLike(/convite-cartao.*\.3mf$/)!)!)["Metadata/custom_gcode_per_layer.xml"]).toBeUndefined();
    await user.click(saveButtons()[2]);
    await waitFor(() => expect(fileLike(/convite-pecas.*\.3mf$/)).toBeTruthy());
    expect(objects(t.files.get(fileLike(/convite-pecas.*\.3mf$/)!)!)).toBe(3); // 1 borboleta + 2 flores
  }, 120_000);

  test("sem tule: sem pausa e o passo a passo muda", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await ready();
    await user.click(screen.getByLabelText(/Imprimir sobre tule/));
    expect(await screen.findByRole("heading", { name: "Passo a passo sem tule" })).toBeInTheDocument();
    await ready();
    await user.click(saveButtons()[0]);
    await waitFor(() => expect(fileLike(/convite-envelope.*\.3mf$/)).toBeTruthy());
    expect(unzipSync(t.files.get(fileLike(/convite-envelope.*\.3mf$/)!)!)["Metadata/custom_gcode_per_layer.xml"]).toBeUndefined();
  }, 120_000);

  test("modelo pronto Casamento: texto, padrão e sem borboleta", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await user.click(screen.getByRole("button", { name: "Casamento" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("Ana & Bruno");
    expect(screen.getByLabelText("Padrão")).toHaveValue("arabesque");
    expect(screen.getByRole("button", { name: "Sem borboleta" })).toHaveAttribute("aria-pressed", "true");
    await ready();
  }, 120_000);

  test("madrinhas: os nomes viram variações com as paletas na ordem, e salvar todas grava os arquivos de cada uma", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await user.click(screen.getByRole("button", { name: "Madrinhas e padrinhos" }));
    const list = await screen.findByRole("list", { name: "Variações" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Marina: Lilás", "Júlia: Rosa", "Camila: Verde sálvia", "Beatriz: Vinho"]);
    await ready();
    t.openPath = "/pasta";
    await user.click(screen.getByRole("button", { name: /Salvar as 4 variações/ }));
    await waitFor(() => expect(fileLike(/julia-rosa-cartao\.3mf$/)).toBeTruthy(), BUILD);
    for (const base of ["marina-lilas", "julia-rosa", "camila-salvia", "beatriz-vinho"]) {
      expect(fileLike(new RegExp(`${base}-envelope\\.3mf$`))).toBeTruthy();
      expect(fileLike(new RegExp(`${base}-pecas\\.3mf$`))).toBeTruthy();
    }
    // o cartão de cada uma leva o nome dela, e as cores mudam de paleta para paleta
    const color = (name: string) => strFromU8(unzipSync(t.files.get(fileLike(new RegExp(`${name}-cartao\\.3mf$`))!)!)["3D/3dmodel.model"]);
    expect(color("marina-lilas")).not.toEqual(color("julia-rosa"));
  }, 240_000);

  test("Aberto e Fechado mostram a prévia dobrada e avisam que não imprime", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await ready();
    expect(screen.getByRole("button", { name: "Mesa (o que imprime)" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Fechado (não imprime)" }));
    expect(screen.getByText(/Prévia do envelope fechado/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aberto (não imprime)" }));
    expect(screen.getByText(/Prévia do envelope com as abas quase planas/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mesa (o que imprime)" }));
    expect(screen.queryByText(/Prévia do envelope/)).not.toBeInTheDocument();
  }, 120_000);

  test("asas levantadas sem tule avisam", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    await user.click(screen.getByLabelText(/Imprimir sobre tule/));
    await user.click(screen.getByRole("button", { name: "Asas levantadas" }));
    expect(screen.getAllByText(/Asas levantadas precisam do tule/).length).toBeGreaterThan(0);
  });

  test("valor fora da faixa fica marcado e não gera", async () => {
    const user = userEvent.setup();
    renderWithApp(<Invite />);
    const w = screen.getByLabelText("Largura do corpo (mm)");
    await user.clear(w);
    await user.type(w, "900");
    expect(await screen.findByText("Corrija os campos em vermelho para ver o convite.")).toBeInTheDocument();
  });
});
