// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ViewTabs from "./ViewTabs";

const views = [
  { id: "closed", label: "Fechada", note: "Como a caixa fica fechada." },
  { id: "open", label: "Aberta" },
];

describe("ViewTabs", () => {
  test("grupo nomeado, aba ativa pressionada e nota da vista ativa", () => {
    render(<ViewTabs views={views} value="closed" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Vista da prévia" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechada" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Como a caixa fica fechada.")).toBeInTheDocument();
  });

  test("trocar de aba chama onChange; vista sem nota não mostra texto", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ViewTabs views={views} value="closed" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Aberta" }));
    expect(onChange).toHaveBeenCalledWith("open");
    rerender(<ViewTabs views={views} value="open" onChange={onChange} />);
    expect(screen.queryByText("Como a caixa fica fechada.")).toBeNull();
  });
});
