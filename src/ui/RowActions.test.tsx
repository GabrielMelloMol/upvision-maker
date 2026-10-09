// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import RowActions from "./RowActions";

const names = () => screen.getAllByRole("menuitem").map((i) => i.textContent);

test("menu ⋯ da linha: Editar, Duplicar, extras e Excluir por último (em vermelho, separado), na mesma ordem sempre", async () => {
  const user = userEvent.setup();
  const calls: string[] = [];
  render(<RowActions subject="PLA Preto" onEdit={() => calls.push("e")} onDuplicate={() => calls.push("d")} onDelete={() => calls.push("x")} extra={[{ label: "Repor", onSelect: () => calls.push("r") }]} />);
  const trigger = screen.getByRole("button", { name: "Ações de PLA Preto" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await user.click(trigger);
  expect(names()).toEqual(["Editar", "Duplicar", "Repor", "Excluir"]);
  expect(screen.getByRole("menuitem", { name: "Excluir" })).toHaveClass("danger");
  expect(screen.getByRole("separator")).toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
  expect(calls).toEqual(["x"]);
  // fechou e o foco voltou ao botão
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveFocus();
});

test("só mostra o que a linha permite; sem nenhuma ação, nada aparece", async () => {
  const user = userEvent.setup();
  const { container, rerender } = render(<RowActions subject="Orçamento 1" onDelete={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Ações de Orçamento 1" }));
  expect(names()).toEqual(["Excluir"]);
  rerender(<RowActions subject="Orçamento 1" />);
  expect(container).toBeEmptyDOMElement();
});

test("teclado: seta para baixo no botão abre, Esc fecha sem escolher", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  render(<RowActions subject="Ana" onEdit={onEdit} onDelete={vi.fn()} />);
  screen.getByRole("button", { name: "Ações de Ana" }).focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("menuitem", { name: "Editar" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
