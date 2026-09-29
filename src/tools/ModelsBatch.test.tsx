// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

const t = setupTauri();

beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});
const BUILD = { timeout: 30_000 };
const hud = (c: HTMLElement) => c.querySelector(".hud")?.textContent ?? "";

async function open(name: string) {
  const user = userEvent.setup();
  const r = renderWithApp(<Models />);
  await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), name);
  await user.click(within(screen.getByRole("group", { name: "Modelo" })).getByRole("button", { name }));
  return { user, ...r };
}

describe("lote nos modelos prontos (#76)", () => {
  test("carimbo: uma cópia por linha, todas na mesa, 3MF com um objeto por cópia", async () => {
    const { user, container } = await open("Carimbo");
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    const oneW = parseFloat(hud(container));
    await user.click(screen.getByRole("switch", { name: /Lote/ }));
    const box = screen.getByLabelText(/^Cópias/);
    expect(box).toHaveValue("A"); // começa com o texto atual
    fireEvent.change(box, { target: { value: "A\nB\nC\n\nD" } });
    expect(screen.getByText(/4 cópias/)).toBeInTheDocument();
    await waitFor(() => expect(parseFloat(hud(container))).toBeGreaterThan(oneW * 1.8), BUILD);
    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect([...t.files.keys()].some((p) => /carimbo-lote\.3mf$/.test(p))).toBe(true));
  }, 60_000);

  test("tag de pet: campos por ';'; lote vazio vira prévia vazia; modelo sem lote não mostra a opção", async () => {
    const { user } = await open("Tag de pet");
    await user.click(screen.getByRole("switch", { name: /Lote/ }));
    expect(screen.getByText(/Nome.*; .*Telefone/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Cópias/), { target: { value: "" } });
    expect(await screen.findByText("Digite uma linha por cópia.", undefined, BUILD)).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Buscar modelo" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), "Ejetor");
    await user.click(within(screen.getByRole("group", { name: "Modelo" })).getByRole("button", { name: "Ejetor de brigadeiro" }));
    expect(screen.queryByRole("switch", { name: /Lote/ })).toBeNull();
  }, 60_000);
});
