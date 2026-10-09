// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { PAGES } from "../pages";
import { renderWithApp, setupTauri } from "../test/harness";
import CommandPalette from "./CommandPalette";

setupTauri();

async function open(query: string) {
  const user = userEvent.setup();
  const onPick = vi.fn();
  renderWithApp(<CommandPalette pages={PAGES} onPick={onPick} onClose={() => {}} />);
  await user.type(await screen.findByRole("combobox"), query);
  return { user, onPick };
}

describe("busca do ⌘K acha os Modelos prontos", { timeout: 30_000 }, () => { // o catálogo carrega sob demanda: a 1ª busca do arquivo demora
  test.each([
    ["geladeira", "Ímã de geladeira"],
    ["abajur", "Abajur de mesa"],
    ["camiseta", "Estampa de camisa"],
    ["porta copos", "Porta-copos"],
    ["tecla", "Tecla de teclado"],
    ["rpg", "Dados de RPG"],
  ])("%s → %s", async (query, title) => {
    await open(query);
    const hit = await screen.findByRole("option", { name: new RegExp(title) });
    expect(hit).toHaveTextContent("Modelos prontos ›");
  });

  test("escolher o modelo abre os Modelos prontos já nele", async () => {
    const { user, onPick } = await open("geladeira");
    await user.click(await screen.findByRole("option", { name: /Ímã de geladeira/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ pageId: "models", intent: { id: "fridgeMagnet" } }));
  });

  test("as telas continuam aparecendo (litofania acha a ferramenta)", async () => {
    await open("litofania");
    const hits = await screen.findAllByRole("option", { name: /Foto em relevo/ });
    expect(hits[0]).toHaveTextContent("Foto em relevo"); // a tela vem primeiro (a ajuda dela vem depois)
  });

  test("a ocasião acha os modelos dela (Dia das Mães → Mapa estelar)", async () => {
    await open("Dia das Mães");
    await waitFor(() => expect(screen.getAllByRole("option").some((o) => /Mapa estelar/.test(o.textContent ?? ""))).toBe(true));
  });

  test("sem busca, os modelos não enchem a lista", async () => {
    renderWithApp(<CommandPalette pages={PAGES} onPick={() => {}} onClose={() => {}} />);
    await screen.findByRole("combobox");
    expect(screen.queryAllByRole("option").some((o) => /Modelos prontos ›/.test(o.textContent ?? ""))).toBe(false);
  });
});
