// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

setupTauri();

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

describe("textos dos modelos: emoji e fonte por parte (#68, #55, #48)", () => {
  test("letreiro: uma fonte por linha; emoji pelo seletor entra no texto e muda a peça", async () => {
    const { user, container } = await open("Letreiro em camadas");
    expect(screen.getByRole("button", { name: "Fonte da linha 1: Pacifico. Trocar fonte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fonte da linha 2: Hanken Grotesk. Trocar fonte" })).toBeInTheDocument();
    await waitFor(() => expect(hud(container)).toMatch(/mm$/), BUILD);
    const before = parseFloat(hud(container));
    await user.click(screen.getAllByRole("button", { name: "Inserir emoji" })[1]);
    await user.click(screen.getByRole("button", { name: "Emoji ⭐" }));
    expect(screen.getAllByLabelText("Texto")[1]).toHaveValue("Aniversário⭐");
    // a linha mantém a altura total: com o emoji (mais alto que as letras) ela é reescalada
    await waitFor(() => expect(Math.abs(parseFloat(hud(container)) - before)).toBeGreaterThan(5), BUILD);
    expect(container.querySelector(".error, [role=alert]")).toBeNull();
  }, 60_000);

  test("letra grande: fonte da letra separada da fonte do nome", async () => {
    const { user } = await open("Letra grande");
    expect(screen.getByRole("button", { name: "Fonte da letra: Anton. Trocar fonte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Fonte: / })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fonte da letra: Anton. Trocar fonte" }));
    const sheet = screen.getByRole("dialog", { name: "Escolher fonte" });
    await user.type(within(sheet).getByRole("searchbox", { name: "Buscar fonte" }), "lobs");
    await user.click(within(sheet).getByRole("button", { name: "Lobster (Cursiva)" }));
    expect(screen.getByRole("button", { name: "Fonte da letra: Lobster. Trocar fonte" })).toBeInTheDocument();
  }, 60_000);
});
