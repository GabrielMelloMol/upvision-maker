// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { setSearchPicker, type SearchItem } from "../ui/search";
import Home from "./Home";

setupTauri();

test("a caixa do Início mostra sugestões enquanto digita; setas + Enter, clique e Esc (#316)", async () => {
  const picked: SearchItem[] = [];
  setSearchPicker((it) => picked.push(it));
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Home go={go} />);
  const box = screen.getByRole("combobox", { name: "O que você quer criar?" });
  expect(box).toHaveAttribute("aria-expanded", "false");

  await user.type(box, "calcul");
  expect(box).toHaveAttribute("aria-expanded", "true");
  const first = await screen.findByRole("option", { name: /^Calculadora/ });
  expect(first).toHaveAttribute("aria-selected", "false"); // nada marcado: Enter ainda é o Procurar

  await user.keyboard("{ArrowDown}");
  expect(box).toHaveAttribute("aria-activedescendant", "home-page-calculator");
  await user.keyboard("{Enter}");
  expect(picked.map((p) => p.pageId)).toEqual(["calculator"]);
  expect(go).not.toHaveBeenCalled();

  await user.type(box, "a");
  await user.click(await screen.findByRole("option", { name: /^Calculadora/ }));
  expect(picked).toHaveLength(2);

  await user.type(box, "o");
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(box).toHaveValue("calculao");
});

test("Enter sem escolher continua procurando em Criar", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Home go={go} />);
  await user.type(screen.getByRole("combobox", { name: "O que você quer criar?" }), "chaveiro{Enter}");
  await waitFor(() => expect(go).toHaveBeenCalledWith("create"));
});
