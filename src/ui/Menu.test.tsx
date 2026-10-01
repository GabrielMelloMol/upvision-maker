// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import Menu from "./Menu";

const setup = () => {
  const abrir = vi.fn(), excluir = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <Menu label="Ações de Chaveiro Ana" items={[{ label: "Abrir", onSelect: abrir }, { label: "Renomear", onSelect: vi.fn() }, { label: "Excluir", onSelect: excluir, danger: true }]} />
      <button>fora</button>
    </>,
  );
  return { user, abrir, excluir, trigger: screen.getByRole("button", { name: "Ações de Chaveiro Ana" }) };
};

test("abre com o botão, foca o 1º item, setas andam (com volta), Enter escolhe e o foco volta ao botão", async () => {
  const { user, excluir, trigger } = setup();
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("menuitem", { name: "Abrir" })).toHaveFocus();
  await user.keyboard("{ArrowUp}");
  expect(screen.getByRole("menuitem", { name: "Excluir" })).toHaveFocus();
  await user.keyboard("{Home}{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Renomear" })).toHaveFocus();
  await user.keyboard("{End}{Enter}");
  expect(excluir).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveFocus();
});

test("Esc fecha e devolve o foco; clicar fora fecha sem escolher", async () => {
  const { user, abrir, trigger } = setup();
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "fora" }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(abrir).not.toHaveBeenCalled();
});

test("seta para baixo no botão abre e foca o 1º item; separador antes do item de excluir", async () => {
  const { user, trigger } = setup();
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Abrir" })).toHaveFocus();
  const menu = screen.getByRole("menu");
  const kids = [...menu.children].map((el) => el.getAttribute("role"));
  expect(kids).toEqual(["menuitem", "menuitem", "separator", "menuitem"]);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
