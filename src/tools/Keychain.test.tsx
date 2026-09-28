// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Keychain from "./Keychain";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 20_000 };
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});

const hud = (c: HTMLElement) => c.querySelector(".hud")?.textContent ?? "";

describe("Chaveiros", () => {
  test("um nome: base + texto em cores separadas, salva 3MF com o nome", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    expect([...container.querySelectorAll(".legend span")].map((s) => s.textContent)).toEqual(["Base", "Texto"]);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/chaveiro-ana.3mf")).toBe(true));
  });

  test("lote: um chaveiro por nome (sem repetidos), STL de cada", async () => {
    const user = userEvent.setup();
    renderWithApp(<Keychain />);
    await user.click(screen.getByRole("button", { name: "Lote de nomes" }));
    const box = screen.getByLabelText(/^Nomes/);
    await user.clear(box);
    await user.type(box, "Ana, Bia, Ana");
    expect(screen.getByText("2 nomes · todos na mesma mesa")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "STL bia" }, BUILD));
    await waitFor(() => expect(t.files.has("/saida/chaveiros-bia.stl")).toBe(true));
    expect(screen.getByRole("button", { name: "STL ana" })).toBeInTheDocument();
  }, 30_000);

  test("lote acima de 60 nomes: gera só os 60 primeiros e avisa", async () => {
    const user = userEvent.setup();
    renderWithApp(<Keychain />);
    await user.click(screen.getByRole("button", { name: "Lote de nomes" }));
    fireEvent.change(screen.getByLabelText(/^Nomes/), { target: { value: Array.from({ length: 61 }, (_, i) => `N${i}`).join("\n") } });
    expect(await screen.findByText("Só os primeiros 60 nomes foram gerados.", undefined, { timeout: 40_000 })).toBeInTheDocument();
    expect(screen.getByText(/não cabem numa mesa de 256 mm/)).toBeInTheDocument();
  }, 60_000);

  test("logo sem texto: chaveiro só com o logo; remover logo esvazia", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await user.clear(screen.getByLabelText("Texto"));
    expect(await screen.findByText("Digite um nome para ver o chaveiro.", undefined, BUILD)).toBeInTheDocument();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([LOGO_SVG], "logo.svg", { type: "image/svg+xml" }));
    expect(await screen.findByLabelText(/^Altura do logo/)).toHaveValue(16);
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/chaveiro-logo.3mf")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Remover logo" }));
    expect(await screen.findByText("Digite um nome para ver o chaveiro.", undefined, BUILD)).toBeInTheDocument();
  }, 30_000);

  test("logo + texto: o logo fica à esquerda e a peça fica mais larga", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    const width = () => Number(hud(container).split(" ")[0]);
    const before = width();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File([LOGO_SVG], "logo.svg", { type: "image/svg+xml" }));
    await waitFor(() => expect(width()).toBeGreaterThan(before + 10), BUILD);
  }, 30_000);

  test("altura do texto fora da faixa: não gera; fonte troca a amostra", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await user.selectOptions(screen.getByRole("combobox"), "lobster");
    expect(container.querySelector<HTMLElement>(".font-sample")!.style.fontFamily).toContain("Lobster");
    await user.clear(screen.getByLabelText(/^Altura do texto/));
    await user.type(screen.getByLabelText(/^Altura do texto/), "99");
    expect(await screen.findByText("Corrija os campos em vermelho.", undefined, BUILD)).toBeInTheDocument();
  });

  test("logo que não abre mostra erro", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("bad")));
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByText(/Não consegui abrir esta imagem/)).toBeInTheDocument();
  });

  test("cores da base e do texto; argola desligada deixa a peça mais estreita", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<Keychain />);
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    const width = () => Number(hud(container).split(" ")[0]);
    const before = width();
    const [base, top] = container.querySelectorAll<HTMLInputElement>('input[type="color"]');
    fireEvent.input(base, { target: { value: "#ff0000" } });
    fireEvent.input(top, { target: { value: "#00ff00" } });
    await user.click(screen.getByRole("checkbox", { name: /Argola/ }));
    await waitFor(() => expect(width()).toBeLessThan(before), BUILD);
    expect([...container.querySelectorAll<HTMLElement>(".legend i")].map((i) => i.style.background)).toEqual(["#ff0000", "#00ff00"]);
    await user.click(screen.getByRole("button", { name: "Lote de nomes" }));
    await user.click(screen.getByRole("button", { name: "Um nome" }));
    expect(screen.getByLabelText("Texto")).toHaveValue("Ana");
  }, 30_000);
});
