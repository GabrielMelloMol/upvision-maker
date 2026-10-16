// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, test, vi } from "vitest";
import { boxStl } from "../test/boxStl";
import { renderWithApp, setupTauri } from "../test/harness";
import BedCut from "./BedCut";

// a fonte vem do disco (no app o Vite entrega o arquivo)
vi.mock("../geometry/fonts", async (orig) => {
  const mod = await orig<typeof import("../geometry/fonts")>();
  const b = readFileSync("node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff");
  const font = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { ...mod, loadFont: async () => font };
});
vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();
const BUILD = { timeout: 60_000 };
const stl = (x: number, y: number, z: number) => new File([boxStl(x, y, z)], "grande.stl", { type: "model/stl" });

describe("Cortar para caber na mesa (#218)", { timeout: 120_000 }, () => {
  test("sem arquivo: pede o STL e explica quando usar", () => {
    renderWithApp(<BedCut />);
    expect(screen.getByText("Envie um STL ou 3MF grande para cortar.")).toBeInTheDocument();
    expect(screen.getByText(/Quando usar: o STL é maior que a mesa/)).toBeInTheDocument();
  });

  test("peça de 300 × 200 × 100 na mesa de 256: sugere 2 partes, mostra 1 junta e salva o 3MF com os pedaços", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<BedCut />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl(300, 200, 100));
    expect(await screen.findByText(/Peça: 300,0 × 200,0 × 100,0 mm/)).toBeInTheDocument();
    expect(screen.getByText(/o app sugere 2 × 1 × 1 partes \(2 pedaços\)/)).toBeInTheDocument();
    const result = await screen.findByLabelText("Resultado do corte", undefined, BUILD);
    await waitFor(() => expect(result.textContent).toMatch(/2 pedaços, 1 junta, 2 mesas/), BUILD);
    expect(within(result).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Peça 1 (juntas 1)"),
      expect.stringContaining("Peça 2 (juntas 1)"),
      expect.stringContaining("Chave ou pinos da junta 1"),
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: /Salvar 3MF/ })).toBeEnabled(), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/grande-cortes.3mf")).toBe(true));
  }, 120_000);

  test("mesa pequena pronta e partes escolhidas à mão mudam o resultado; peça que cabe diz que não precisa cortar", async () => {
    const user = userEvent.setup();
    const { container } = renderWithApp(<BedCut />);
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, stl(300, 200, 100));
    await user.click(screen.getByRole("button", { name: "Mesa pequena (180)" }));
    expect(await screen.findByText(/o app sugere 2 × 2 × 1 partes \(4 pedaços\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mesa grande (350)" }));
    expect(await screen.findByText(/já cabe na mesa/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sem encaixe" }));
    expect(screen.getByText(/Só o corte/)).toBeInTheDocument();
  }, 120_000);

  test("arquivo que não é STL nem 3MF: avisa", async () => {
    const { container } = renderWithApp(<BedCut />);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByText("Envie um arquivo .stl ou .3mf.")).toBeInTheDocument();
  });
});
