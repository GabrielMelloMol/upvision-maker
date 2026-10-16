// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import ViewToggle from "./ViewToggle";

test("alterna Mesa e Montada; o aviso só aparece na vista montada", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<ViewToggle value="table" onChange={onChange} info="Não imprime." />);
  expect(screen.getByRole("button", { name: "Mesa (o que imprime)" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("Não imprime.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Montada (não imprime)" }));
  expect(onChange).toHaveBeenCalledWith("assembled");
  rerender(<ViewToggle value="assembled" onChange={onChange} info="Não imprime." />);
  expect(screen.getByText("Não imprime.")).toBeInTheDocument();
});
